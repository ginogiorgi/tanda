-- ════════════════════════════════════════════════════════════════════════════
-- Feedback 3 #17 — Reportar bugs / pedir mejoras.
--
--  * `feedback_reports`: respaldo de cada reporte (el mail a Gino puede fallar; el reporte queda).
--    Interna: RLS sin policy y sin grants al cliente; solo la escribe `POST /api/feedback` con la
--    service role vía `submit_feedback`. `user_id` sobrevive al borrado de la cuenta (set null).
--  * `submit_feedback`: límite + alta atómicos (lock por IP): 5 por hora y 20 por día, por usuario y por
--    IP (hash, nunca la IP en claro). Devuelve el id o `rate_limited`.
--  * Poda diaria (`tanda-feedback-prune`): reportes de más de 365 días.
-- ════════════════════════════════════════════════════════════════════════════

create table if not exists public.feedback_reports (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid references auth.users (id) on delete set null,
  username text,
  kind text not null check (kind in ('bug', 'idea')),
  message text not null check (char_length(message) between 1 and 1000),
  route text check (char_length(route) <= 200),
  meta jsonb not null default '{}'::jsonb,
  ip_hash text not null check (char_length(ip_hash) between 16 and 128),
  emailed boolean not null default false
);
create index if not exists feedback_reports_user_idx on public.feedback_reports (user_id, created_at desc);
create index if not exists feedback_reports_ip_idx on public.feedback_reports (ip_hash, created_at desc);
create index if not exists feedback_reports_created_idx on public.feedback_reports (created_at);
alter table public.feedback_reports enable row level security;
revoke all on table public.feedback_reports from public, anon, authenticated;
grant select, insert, update, delete on table public.feedback_reports to service_role;
comment on table public.feedback_reports is 'Reportes de bug/mejora (feedback 3 #17). Solo service role vía submit_feedback; poda a 365 días.';

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
        where ip_hash = p_ip_hash and created_at > now() - make_interval(hours => 1)) >= v_hour
     or (select count(*) from public.feedback_reports
        where ip_hash = p_ip_hash and created_at > now() - make_interval(days => 1)) >= v_day
     or (p_user is not null and (
          (select count(*) from public.feedback_reports
             where user_id = p_user and created_at > now() - make_interval(hours => 1)) >= v_hour
          or (select count(*) from public.feedback_reports
             where user_id = p_user and created_at > now() - make_interval(days => 1)) >= v_day))
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

-- Poda diaria (03:40 UTC): los reportes viejos no sirven y no hace falta guardarlos para siempre.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'tanda-feedback-prune';
    perform cron.schedule(
      'tanda-feedback-prune',
      '40 3 * * *',
      $cron$delete from public.feedback_reports where created_at < now() - make_interval(days => 365)$cron$
    );
  end if;
end;
$$;
