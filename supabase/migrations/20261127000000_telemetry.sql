-- ════════════════════════════════════════════════════════════════════════════
-- Feedback 4 · Fase F — telemetría propia y reportes automáticos.
--
--  * `client_events`: errores/eventos que manda el cliente (pokes que fallan, canal caído, watchdog
--    del penal). Interna: RLS sin policy, sin grants; solo se escribe con `log_client_event` (sesión
--    obligatoria, rate limit 30 cada 10 min por usuario). Poda a 30 días con el resto de las tablas ops.
--  * `feedback_reports` acepta `kind = 'auto'`: lo manda solo la pantalla de error. Una fila por
--    `fingerprint` (hash de mensaje + ruta + primer frame) con contador de ocurrencias; el mail sale
--    como mucho una vez cada 24 h por fingerprint (`submit_auto_report` decide). Tope anti-abuso:
--    10 fingerprints nuevos por hora por IP.
--  * Aviso del watchdog por mail: `ops_events` gana `mailed`. Un cron por minuto (`tanda-ops-notify`)
--    hace un POST a la app (`/api/ops/notify`) SOLO si hay eventos pendientes de los tipos que avisan;
--    la URL vive en Vault (`ops_notify_url`; sin configurar = no hace nada, como en local). La ruta no
--    confía en quien la llama: lee los pendientes de la DB, deduplica y marca (llamarla de más no hace daño).
-- ════════════════════════════════════════════════════════════════════════════

-- ───────────────────────── client_events ─────────────────────────
create table if not exists public.client_events (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  user_id uuid references auth.users (id) on delete set null,
  kind text not null check (kind ~ '^[a-z_:]{3,60}$'),
  route text check (char_length(route) <= 200),
  detail jsonb not null default '{}'::jsonb check (pg_column_size(detail) <= 4096)
);
create index if not exists client_events_created_idx on public.client_events (created_at);
create index if not exists client_events_kind_idx on public.client_events (kind, created_at desc);
create index if not exists client_events_user_idx on public.client_events (user_id);
alter table public.client_events enable row level security;
revoke all on table public.client_events from public, anon, authenticated;
grant select, insert, delete on table public.client_events to service_role;
comment on table public.client_events is
  'Telemetría del cliente (feedback 4 F). Solo log_client_event (SECURITY DEFINER, rate limit); poda a 30 días.';

create or replace function public.log_client_event(p_kind text, p_route text, p_detail jsonb)
returns void
language plpgsql security definer set search_path to ''
as $$
declare
  uid uuid := (select auth.uid());
begin
  if uid is null then raise exception 'unauthenticated'; end if;
  perform public.enforce_rate_limit('client_event', 30, make_interval(mins => 10));
  if p_kind is null or p_kind !~ '^[a-z_:]{3,60}$' then raise exception 'bad_kind'; end if;
  if pg_column_size(coalesce(p_detail, '{}'::jsonb)) > 4096 then raise exception 'too_long'; end if;
  insert into public.client_events (user_id, kind, route, detail)
  values (uid, p_kind, left(p_route, 200), coalesce(p_detail, '{}'::jsonb));
end;
$$;
revoke all on function public.log_client_event(text, text, jsonb) from public, anon;
grant execute on function public.log_client_event(text, text, jsonb) to authenticated;

-- ───────────────────────── reportes automáticos ─────────────────────────
alter table public.feedback_reports drop constraint if exists feedback_reports_kind_check;
alter table public.feedback_reports add constraint feedback_reports_kind_check check (kind in ('bug', 'idea', 'auto'));
alter table public.feedback_reports add column if not exists fingerprint text check (fingerprint ~ '^[0-9a-f]{16,64}$');
alter table public.feedback_reports add column if not exists occurrences int not null default 1;
alter table public.feedback_reports add column if not exists last_seen_at timestamptz not null default now();
alter table public.feedback_reports add column if not exists emailed_at timestamptz;
create unique index if not exists feedback_reports_fingerprint_idx
  on public.feedback_reports (fingerprint) where kind = 'auto';

-- Los reportes automáticos no consumen el cupo de los manuales (5/h, 20/día).
create or replace function public.submit_feedback(
  p_user uuid,
  p_username text,
  p_kind text,
  p_message text,
  p_route text,
  p_meta jsonb,
  p_ip_hash text
)
returns uuid
language plpgsql security definer set search_path to ''
as $$
declare
  v_id uuid;
  v_hour constant int := 5;
  v_day constant int := 20;
begin
  -- Serializa los envíos de una misma IP (y de un mismo usuario) para que el límite no se saltee en ráfaga.
  perform pg_advisory_xact_lock(hashtextextended('feedback:ip:' || p_ip_hash, 0));
  if p_user is not null then
    perform pg_advisory_xact_lock(hashtextextended('feedback:user:' || p_user::text, 0));
  end if;

  if (select count(*) from public.feedback_reports
        where kind <> 'auto' and ip_hash = p_ip_hash and created_at > now() - make_interval(hours => 1)) >= v_hour
     or (select count(*) from public.feedback_reports
        where kind <> 'auto' and ip_hash = p_ip_hash and created_at > now() - make_interval(days => 1)) >= v_day
     or (p_user is not null and (
          (select count(*) from public.feedback_reports
             where kind <> 'auto' and user_id = p_user and created_at > now() - make_interval(hours => 1)) >= v_hour
          or (select count(*) from public.feedback_reports
             where kind <> 'auto' and user_id = p_user and created_at > now() - make_interval(days => 1)) >= v_day))
  then
    raise exception 'rate_limited';
  end if;

  insert into public.feedback_reports (user_id, username, kind, message, route, meta, ip_hash)
  values (p_user, left(p_username, 40), p_kind, p_message, left(p_route, 200), coalesce(p_meta, '{}'::jsonb), p_ip_hash)
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.submit_feedback(uuid, text, text, text, text, jsonb, text) from public, anon, authenticated;
grant execute on function public.submit_feedback(uuid, text, text, text, text, jsonb, text) to service_role;

-- Alta o suma de un reporte automático. `notify` = hay que mandar el mail (fingerprint nuevo o el último
-- mail de ese fingerprint tiene más de 24 h). La ruta marca `emailed_at` recién si el mail salió.
create or replace function public.submit_auto_report(
  p_fingerprint text,
  p_user uuid,
  p_message text,
  p_route text,
  p_meta jsonb,
  p_ip_hash text
)
returns table (id uuid, notify boolean, occurrences int)
language plpgsql security definer set search_path to ''
as $$
declare
  v_row public.feedback_reports;
begin
  perform pg_advisory_xact_lock(hashtextextended('feedback:auto:' || p_fingerprint, 0));
  select * into v_row from public.feedback_reports fr where fr.kind = 'auto' and fr.fingerprint = p_fingerprint;
  if found then
    update public.feedback_reports fr
      set occurrences = fr.occurrences + 1, last_seen_at = now()
      where fr.id = v_row.id
      returning * into v_row;
    return query select v_row.id,
      (v_row.emailed_at is null or v_row.emailed_at < now() - make_interval(hours => 24)),
      v_row.occurrences;
    return;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('feedback:ip:' || p_ip_hash, 0));
  if (select count(*) from public.feedback_reports fr
        where fr.kind = 'auto' and fr.ip_hash = p_ip_hash and fr.created_at > now() - make_interval(hours => 1)) >= 10 then
    raise exception 'rate_limited';
  end if;
  insert into public.feedback_reports (user_id, kind, message, route, meta, ip_hash, fingerprint)
  values (p_user, 'auto', left(p_message, 1000), left(p_route, 200), coalesce(p_meta, '{}'::jsonb), p_ip_hash, p_fingerprint)
  returning * into v_row;
  return query select v_row.id, true, v_row.occurrences;
end;
$$;
revoke all on function public.submit_auto_report(text, uuid, text, text, jsonb, text) from public, anon, authenticated;
grant execute on function public.submit_auto_report(text, uuid, text, text, jsonb, text) to service_role;

-- ───────────────────────── aviso del watchdog ─────────────────────────
alter table public.ops_events add column if not exists mailed boolean not null default false;
grant select, update on table public.ops_events to service_role;

-- Tipos que avisan por mail (los demás, como `guests_pruned`, solo quedan registrados).
create or replace function public.ops_notify_kinds()
returns text[]
language sql immutable set search_path to ''
as $$ select array['round_stall_healed', 'tick_error']::text[] $$;
revoke all on function public.ops_notify_kinds() from public, anon, authenticated;

create or replace function public.ops_notify_poke()
returns void
language plpgsql security definer set search_path to ''
as $$
declare
  v_url text;
begin
  if not exists (
    select 1 from public.ops_events
    where notified_at is null and kind = any (public.ops_notify_kinds())
  ) then
    return;
  end if;
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'ops_notify_url';
  if v_url is null or v_url = '' then return; end if;
  perform net.http_post(
    url := v_url,
    body := '{}'::jsonb,
    headers := jsonb_build_object('content-type', 'application/json'),
    timeout_milliseconds := 10000
  );
end;
$$;
revoke all on function public.ops_notify_poke() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'tanda-ops-notify';
    perform cron.schedule('tanda-ops-notify', '* * * * *', 'select public.ops_notify_poke()');
  end if;
end;
$$;

-- ───────────────────────── retención ─────────────────────────
create or replace function public.prune_ops_tables()
returns void
language plpgsql security definer set search_path to ''
as $$
begin
  -- Ventanas de rate limit: la más larga es de 1 día.
  delete from public.rate_limits where window_start < now() - make_interval(days => 2);
  -- Intenciones de bot de penales ya cerrados (solo sirven mientras el penal está abierto).
  delete from public.bot_intents bi
    using public.penalties pe
    where pe.id = bi.penalty_id and pe.status = 'resolved' and pe.created_at < now() - make_interval(days => 1);
  delete from public.ops_events where created_at < now() - make_interval(days => 30);
  delete from public.client_events where created_at < now() - make_interval(days => 30);
end;
$$;
revoke all on function public.prune_ops_tables() from public, anon, authenticated;
