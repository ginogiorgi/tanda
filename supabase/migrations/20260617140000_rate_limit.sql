-- Tanda — F9 / tarea 9.5: rate-limit de las RPC abusables (anti-flood).
--
-- Las RPC de cliente ya validan pertenencia/ventana, pero nada frenaba a un cliente que las martillea
-- (crear salas en loop, hammering de select_option, etc.). Agregamos un rate-limit por (usuario,
-- acción) con ventana fija, aplicado dentro de las RPC SECURITY DEFINER. `abandon` ya era casi
-- idempotente (el 2º llamado cae en not_participant por el filtro is_bot=false), pero se incluye por
-- prolijidad. `create_room` entra además de las tres nombradas porque es el verdadero vector de
-- creación de salas (quick_play cae en create_room cuando no hay ninguna abierta).

-- ───────────────────────── tabla de contadores (RLS auto-habilitada por el trigger) ─────────────────────────
-- Una fila por (user_id, action): ventana fija que se reinicia cuando vence. Sin policies → deny-all
-- a anon/authenticated (solo la escribe el helper SECURITY DEFINER).
create table public.rate_limits (
  user_id uuid not null,
  action text not null,
  window_start timestamptz not null default now(),
  count int not null default 0,
  primary key (user_id, action)
);

-- ───────────────────────── enforce_rate_limit (helper interno) ─────────────────────────
-- Incrementa el contador de la ventana actual del caller para `p_action`; si supera `p_max` dentro de
-- `p_window`, tira `rate_limited`. Ventana fija (se reinicia al vencer). Idempotente por upsert.
create function public.enforce_rate_limit(p_action text, p_max int, p_window interval)
returns void language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  v_count int;
begin
  -- Sin sesión no llega acá (las RPC ya cortan en unauthenticated); el backstop/cron tampoco.
  if uid is null then return; end if;

  insert into public.rate_limits as rl (user_id, action, window_start, count)
    values (uid, p_action, now(), 1)
  on conflict (user_id, action) do update
    set count = case when rl.window_start < now() - p_window then 1 else rl.count + 1 end,
        window_start = case when rl.window_start < now() - p_window then now() else rl.window_start end
  returning rl.count into v_count;

  if v_count > p_max then raise exception 'rate_limited'; end if;
end;
$$;
revoke all on function public.enforce_rate_limit(text, int, interval) from public, anon, authenticated;

-- ───────────────────────── wire: quick_play (20/min) ─────────────────────────
create or replace function public.quick_play()
 returns table(room_id uuid, tournament_id uuid, code text)
 language plpgsql security definer set search_path to '' as $function$
declare
  uid uuid := (select auth.uid());
  v_room uuid;
  v_tournament uuid;
  v_code text;
begin
  if uid is null then raise exception 'unauthenticated'; end if;
  perform public.enforce_rate_limit('quick_play', 20, interval '1 minute');
  perform pg_advisory_xact_lock(hashtext('tanda_quick_play'));

  -- 1) Reanudar: torneo en curso, o un lobby propio AÚN ABIERTO (no uno vencido).
  select r.id, t.id, r.code into v_room, v_tournament, v_code
    from public.participants p
    join public.tournaments t on t.id = p.tournament_id
    join public.rooms r on r.id = t.room_id
    where p.user_id = uid and p.is_bot = false
      and (r.status = 'in_progress'
           or (r.status = 'lobby' and r.starts_at > now()))
    order by r.created_at desc
    limit 1;
  if v_room is not null then
    return query select v_room, v_tournament, v_code;
    return;
  end if;

  -- 2) Lobby ABIERTO (dentro de los 2 min) con más humanos y cupo.
  select r.id, t.id, r.code into v_room, v_tournament, v_code
    from public.rooms r
    join public.tournaments t on t.room_id = r.id
    where r.status = 'lobby'
      and r.starts_at > now()
      and (select count(*) from public.participants pp where pp.tournament_id = t.id) < 48
    order by
      (select count(*) from public.participants pp
        where pp.tournament_id = t.id and pp.is_bot = false) desc,
      r.created_at asc
    limit 1;
  if v_room is not null then
    -- idempotente: no duplicar si ya soy parte de esa sala.
    if not exists (
      select 1 from public.participants pq
      where pq.tournament_id = v_tournament and pq.user_id = uid
    ) then
      insert into public.participants (tournament_id, user_id, is_bot)
        values (v_tournament, uid, false);
    end if;
    return query select v_room, v_tournament, v_code;
    return;
  end if;

  -- 3) No hay ninguna abierta → crear.
  return query select * from public.create_room();
end;
$function$;

-- ───────────────────────── wire: select_option (40 / 10s, generoso: respuesta cambiable) ─────────────────────────
create or replace function public.select_option(p_penalty uuid, p_option integer)
 returns void
 language plpgsql security definer set search_path to '' as $function$
declare
  uid uuid := (select auth.uid());
  v_match uuid;
  v_status public.penalty_status;
  v_started timestamptz;
  v_deadline timestamptz;
  v_removed int;
  v_participant uuid;
  v_phase public.answer_phase;
  v_correct int;
  v_is_correct boolean;
begin
  if uid is null then raise exception 'unauthenticated'; end if;
  -- Generoso a propósito: la respuesta es cambiable hasta el deadline (humano puede tocar varias
  -- veces); el límite frena el hammering, no el uso normal.
  perform public.enforce_rate_limit('select_option', 40, interval '10 seconds');

  select match_id, status, started_at, deadline, removed_option
    into v_match, v_status, v_started, v_deadline, v_removed
    from public.penalties where id = p_penalty;
  if v_match is null then raise exception 'penalty_not_found'; end if;

  -- El caller debe ser participante (humano) del match — kicker o keeper, da igual.
  select p.id into v_participant
    from public.matches m
    join public.participants p on p.id in (m.home_participant_id, m.away_participant_id)
    where m.id = v_match and p.user_id = uid;
  if v_participant is null then raise exception 'not_participant'; end if;

  -- Fase según estado del penal. Solo `open`/`second_chance` aceptan selección.
  if v_status = 'open' then
    v_phase := 'first';
  elsif v_status = 'second_chance' then
    v_phase := 'second_chance';
  else
    raise exception 'penalty_closed';
  end if;

  -- Ventana de tiempo: la valida el SERVER contra su `deadline` (anti-trampa, SPEC §1.3/§7).
  if v_started is null or now() < v_started or now() >= v_deadline then
    raise exception 'out_of_window';
  end if;

  -- Opción válida (0-2) y, en segunda chance, distinta de la quitada.
  if p_option < 0 or p_option > 2 then raise exception 'invalid_option'; end if;
  if v_phase = 'second_chance' and p_option = v_removed then
    raise exception 'invalid_option';
  end if;

  -- Corrección server-only: la pregunta entra acá por SECURITY DEFINER (policy deny-all).
  select q.correct_index into v_correct
    from public.questions q
    join public.penalties pe on pe.question_id = q.id
    where pe.id = p_penalty;
  v_is_correct := (p_option = v_correct);

  -- Última selección gana: upsert por (penalty, participant, phase). `is_random=false` porque
  -- la elige un humano presente (las aleatorias de ausentes las pone resolve_penalty, 4.5).
  insert into public.penalty_answers
      (penalty_id, participant_id, option_index, selected_at, is_correct, is_random, phase)
    values (p_penalty, v_participant, p_option, now(), v_is_correct, false, v_phase)
  on conflict (penalty_id, participant_id, phase)
  do update set option_index = excluded.option_index,
                selected_at  = excluded.selected_at,
                is_correct   = excluded.is_correct,
                is_random    = false;
end;
$function$;

-- ───────────────────────── wire: abandon (5/min) ─────────────────────────
create or replace function public.abandon(p_match uuid)
 returns void
 language plpgsql security definer set search_path to '' as $function$
declare
  uid uuid := (select auth.uid());
  v_tournament uuid; v_part uuid; r record;
begin
  if uid is null then raise exception 'unauthenticated'; end if;
  perform public.enforce_rate_limit('abandon', 5, interval '1 minute');

  select tournament_id into v_tournament from public.matches where id = p_match;
  if v_tournament is null then raise exception 'match_not_found'; end if;

  select id into v_part from public.participants
    where tournament_id = v_tournament and user_id = uid and is_bot = false;
  if v_part is null then raise exception 'not_participant'; end if;

  update public.participants set is_bot = true where id = v_part;

  -- Penales en curso donde patea/ataja → ahora los juega el bot (precompute si no respondió).
  for r in
    select pe.id from public.penalties pe
    join public.matches m on m.id = pe.match_id
    where m.tournament_id = v_tournament
      and pe.status in ('open', 'second_chance')
      and (pe.kicker_participant_id = v_part or pe.keeper_participant_id = v_part)
  loop
    perform public.precompute_bot_intents(r.id);
  end loop;
end;
$function$;

-- ───────────────────────── wire: create_room (10/min — vector real de creación de salas) ─────────────────────────
-- create_room no recibe args; reproducimos su cuerpo actual + el enforce. (Reproducción fiel desde
-- pg_get_functiondef del estado vigente.)
create or replace function public.create_room()
 returns table(room_id uuid, tournament_id uuid, code text)
 language plpgsql security definer set search_path to '' as $function$
declare
  uid uuid := (select auth.uid());
  v_room uuid;
  v_tournament uuid;
  v_code text;
begin
  if uid is null then raise exception 'unauthenticated'; end if;
  perform public.enforce_rate_limit('create_room', 10, interval '1 minute');
  v_code := public.gen_room_code();
  insert into public.rooms (code, host_id, status, starts_at)
    values (v_code, uid, 'lobby', now() + interval '2 minutes')
    returning id into v_room;
  insert into public.tournaments (room_id, status, current_phase, seed)
    values (v_room, 'pending', 'groups', (random() * 9.2e18)::bigint)
    returning id into v_tournament;
  insert into public.participants (tournament_id, user_id, is_bot)
    values (v_tournament, uid, false);
  return query select v_room, v_tournament, v_code;
end;
$function$;
