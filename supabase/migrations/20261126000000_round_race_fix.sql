-- Feedback 4 #20 — torneo congelado en prod (22/11, 2d39f332, Argentino, octavos).
--
-- Causa: dos penales humanos de partidos distintos vencían en el mismo instante (reloj común) y se
-- resolvieron en dos transacciones concurrentes (un poke por cliente; `FOR UPDATE SKIP LOCKED` es por
-- fila). Cada `resolve_round` veía el penal del OTRO todavía `open` (sin commit) y salía sin fijar
-- `round_deadline`. Las dos commiteaban → partidos `in_progress`, ningún penal abierto, sin deadline:
-- `open_next_round` sale temprano sin deadline y el barrido final de `tick()` exige que no haya partidos
-- en curso → nadie lo destrababa. Sin excepción → nada en los logs.
--
-- Fix (causa + contramedida):
--  1) `resolve_penalty` y `resolve_round` toman el advisory lock de ronda del torneo (el mismo de
--     `open_next_round`) → la segunda transacción espera y, con READ COMMITTED, ya ve el commit de la
--     primera → fija el deadline. Test: supabase/tests/round_race.test.ts (dos conexiones reales).
--  2) Watchdog en `tick()`: un torneo en estado muerto se destraba solo (round_deadline = now()) y queda
--     registrado en `ops_events` (`round_stall_healed`). Los fallos de los barridos también se registran
--     (`tick_error`, deduplicados por minuto) además del `raise warning`.
--  3) La materialización de bot_intents de `tick()` va en su propio bloque de excepción: antes un error
--     ahí abortaba el tick entero, todos los segundos.

-- ───────────────────────── ops_events: registro operativo del server ─────────────────────────
create table if not exists public.ops_events (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  kind text not null check (kind ~ '^[a-z_]{3,40}$'),
  tournament_id uuid,          -- sin FK: el evento sobrevive a la poda del torneo
  detail jsonb not null default '{}'::jsonb,
  notified_at timestamptz      -- lo marca el aviso por mail (deduplicado)
);
comment on table public.ops_events is
  'Eventos operativos del server (watchdog de tick, errores de barridos). Solo SECURITY DEFINER; poda a 30 días.';
create index if not exists ops_events_kind_t_idx on public.ops_events (kind, tournament_id, created_at desc);
create index if not exists ops_events_pending_idx on public.ops_events (created_at) where notified_at is null;
alter table public.ops_events enable row level security;
revoke all on table public.ops_events from anon, authenticated;

create or replace function public.ops_log(p_kind text, p_tournament uuid, p_detail jsonb, p_dedupe_s int default 60)
returns void
language plpgsql security definer set search_path to ''
as $$
begin
  if exists (
    select 1 from public.ops_events
    where kind = p_kind and tournament_id is not distinct from p_tournament
      and created_at > now() - make_interval(secs => p_dedupe_s)
  ) then
    return;
  end if;
  insert into public.ops_events (kind, tournament_id, detail) values (p_kind, p_tournament, coalesce(p_detail, '{}'::jsonb));
end;
$$;
revoke all on function public.ops_log(text, uuid, jsonb, int) from public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.resolve_penalty(p_penalty uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  uid uuid := (select auth.uid());
  v_match uuid; v_idx int; v_status public.penalty_status;
  v_deadline timestamptz; v_question uuid; v_kicker uuid; v_keeper uuid;
  v_tournament uuid; v_t_seed bigint; v_seed bigint;
  v_correct int; v_prompt text; v_options jsonb;
  v_phase public.answer_phase;
  v_home uuid; v_away uuid; v_home_score int; v_away_score int;
  v_k_ans record; v_g_ans record;
  v_k_ok boolean; v_g_ok boolean;
  v_winner text; v_reason text; v_scored boolean; v_variant int;
  v_wrong int[]; v_removed_k int; v_removed_g int;
  v_part uuid; v_new_deadline timestamptz;
  v_won_by_speed boolean := false;  -- 10.7: ganó por ser más rápido (ambos acertaron)
begin
  -- Feedback 4 #20: serializar por torneo ANTES de tomar filas (mismo orden advisory → filas que
  -- open_next_round). Sin esto, dos penales que vencen juntos se resolvían en paralelo y cada
  -- resolve_round veía el penal del otro todavía `open` → nadie fijaba round_deadline → torneo muerto.
  select m.tournament_id into v_tournament
    from public.penalties pe join public.matches m on m.id = pe.match_id
    where pe.id = p_penalty;
  if v_tournament is null then return; end if;
  perform pg_advisory_xact_lock(public.engine_hash32('tanda_round:' || v_tournament::text));

  select match_id, idx, status, deadline, question_id, kicker_participant_id, keeper_participant_id
    into v_match, v_idx, v_status, v_deadline, v_question, v_kicker, v_keeper
    from public.penalties
    where id = p_penalty and status in ('open', 'second_chance')
    for update skip locked;
  if v_match is null then return; end if;

  if uid is not null and not public.is_match_member(v_match) then
    raise exception 'not_participant';
  end if;

  v_phase := case v_status when 'open' then 'first' else 'second_chance' end;

  -- Feedback 3 #2: se resuelve SOLO al vencer el deadline (aunque hayan respondido los dos): así nadie
  -- ve el resultado antes de tiempo y la jugada arranca a la vez para todos.
  if now() < v_deadline then
    raise exception 'too_early';
  end if;

  select t.id, t.seed into v_tournament, v_t_seed
    from public.matches m join public.tournaments t on t.id = m.tournament_id
    where m.id = v_match;
  v_seed := (coalesce(v_t_seed, 0) # public.engine_hash32(v_match::text || ':' || v_idx)) & 4294967295;

  select q.correct_index, q.prompt, q.options
    into v_correct, v_prompt, v_options
    from public.questions q where q.id = v_question;

  perform public.materialize_bot_intents(p_penalty, true);

  foreach v_part in array array[v_kicker, v_keeper] loop
    if not exists (
      select 1 from public.penalty_answers
      where penalty_id = p_penalty and participant_id = v_part and phase = v_phase
    ) then
      insert into public.penalty_answers
        (penalty_id, participant_id, option_index, selected_at, is_correct, is_random, phase)
      values (
        p_penalty, v_part,
        public.engine_rand_int(v_seed # public.engine_hash32(v_part::text), 3),
        now(), null, true, v_phase
      );
      update public.penalty_answers
        set is_correct = (option_index = v_correct)
        where penalty_id = p_penalty and participant_id = v_part and phase = v_phase;
    end if;
  end loop;

  select option_index, selected_at, is_correct into v_k_ans
    from public.penalty_answers
    where penalty_id = p_penalty and participant_id = v_kicker and phase = v_phase;
  select option_index, selected_at, is_correct into v_g_ans
    from public.penalty_answers
    where penalty_id = p_penalty and participant_id = v_keeper and phase = v_phase;

  v_k_ok := coalesce(v_k_ans.is_correct, false);
  v_g_ok := coalesce(v_g_ans.is_correct, false);

  if v_k_ok and v_g_ok then
    if v_k_ans.selected_at < v_g_ans.selected_at then
      v_winner := 'kicker'; v_reason := 'goal'; v_won_by_speed := true;
    elsif v_g_ans.selected_at < v_k_ans.selected_at then
      v_winner := 'keeper'; v_reason := 'save'; v_won_by_speed := true;
    elsif public.engine_rand_bool(v_seed) then
      v_winner := 'kicker'; v_reason := 'goal';
    else
      v_winner := 'keeper'; v_reason := 'save';
    end if;
  elsif v_k_ok then
    v_winner := 'kicker'; v_reason := 'goal';
  elsif v_g_ok then
    v_winner := 'keeper'; v_reason := 'miss_wide';
  else
    v_winner := null;
  end if;

  if v_winner is null and v_phase = 'first' then
    -- Tarea 10: a cada jugador se le quita la opción que ÉL eligió (ambos erraron → su pick es
    -- incorrecto). Borde sin opción (no debería pasar: se asigna una arriba) → una incorrecta por seed.
    select array_agg(i order by i) into v_wrong
      from generate_series(0, 2) i where i <> v_correct;
    v_removed_k := case
      when v_k_ans.option_index is not null and v_k_ans.option_index <> v_correct
        then v_k_ans.option_index
      else v_wrong[public.engine_rand_int(v_seed, 2) + 1] end;
    v_removed_g := case
      when v_g_ans.option_index is not null and v_g_ans.option_index <> v_correct
        then v_g_ans.option_index
      else v_wrong[public.engine_rand_int((v_seed # 1757446635) & 4294967295, 2) + 1] end;

    v_new_deadline := now() + make_interval(secs => (public.game_timing()->>'secondChanceS')::int);
    update public.penalties
      set status = 'second_chance', second_chance = true,
          removed_option = v_removed_k,
          removed_option_kicker = v_removed_k, removed_option_keeper = v_removed_g,
          started_at = now(), deadline = v_new_deadline
      where id = p_penalty;

    perform realtime.send(
      jsonb_build_object(
        'penalty_id', p_penalty, 'match_id', v_match, 'idx', v_idx,
        'prompt', v_prompt, 'options', v_options,
        'removed_option_kicker', v_removed_k, 'removed_option_keeper', v_removed_g,
        'phase', 'second_chance', 'reason', 'both_missed',  -- 10.13
        'started_at', now(), 'deadline', v_new_deadline,
        'server_now', now()
      ),
      'penal:second_chance', 'match:' || v_match::text, true
    );

    perform public.precompute_bot_intents(p_penalty);
    return;
  end if;

  if v_winner is null then
    v_winner := 'keeper'; v_reason := 'miss_wide';
  end if;
  v_scored := (v_winner = 'kicker');
  v_variant := public.engine_rand_int((v_seed # 1597334677) & 4294967295, 4);

  update public.penalties
    set status = 'resolved',
        resolution = jsonb_build_object(
          'winner', v_winner, 'scored', v_scored, 'reason', v_reason,
          'variant', v_variant, 'phase', v_phase, 'won_by_speed', v_won_by_speed
        )
    where id = p_penalty;

  select home_participant_id, away_participant_id into v_home, v_away
    from public.matches where id = v_match;
  if v_scored then
    if v_kicker = v_home then
      update public.matches set home_score = home_score + 1 where id = v_match;
    else
      update public.matches set away_score = away_score + 1 where id = v_match;
    end if;
  end if;
  select home_score, away_score into v_home_score, v_away_score
    from public.matches where id = v_match;

  perform realtime.send(
    jsonb_build_object(
      'penalty_id', p_penalty, 'match_id', v_match, 'idx', v_idx,
      'outcome', 'resolved', 'winner', v_winner, 'scored', v_scored,
      'reason', v_reason, 'variant', v_variant, 'phase', v_phase,
      'correct_index', v_correct,
      'home_score', v_home_score, 'away_score', v_away_score,
      'won_by_speed', v_won_by_speed,
      'kicker_participant_id', v_kicker, 'keeper_participant_id', v_keeper,
      'kicker_selected_at', v_k_ans.selected_at, 'keeper_selected_at', v_g_ans.selected_at
    ),
    'penal:result', 'match:' || v_match::text, true
  );

  -- 4.6: NO encadenar el próximo penal del match. Finalizar si quedó decidido y dejar que el
  -- barrier de ronda (resolve_round) coordine la apertura conjunta de la próxima ronda.
  perform public.finalize_match(v_match);
  perform public.emit_score_live(v_match);
  perform public.resolve_round(v_tournament);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.resolve_round(p_tournament uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  -- Reentrante si viene de resolve_penalty (ya lo tiene); protege a cualquier otro llamador.
  perform pg_advisory_xact_lock(public.engine_hash32('tanda_round:' || p_tournament::text));

  if exists (
    select 1 from public.penalties pe join public.matches m on m.id = pe.match_id
    where m.tournament_id = p_tournament and not m.is_bot_only
      and pe.status in ('open', 'second_chance')
  ) then
    return;  -- ronda en juego: faltan penales (o 2ª chances) por cerrar
  end if;

  if exists (
    select 1 from public.matches m
    where m.tournament_id = p_tournament and not m.is_bot_only
      and m.status in ('in_progress', 'sudden_death')
  ) then
    update public.tournaments set round_deadline = now() + make_interval(secs => (public.game_timing()->>'betweenPenalsS')::float8)
      where id = p_tournament and status = 'in_progress';
  else
    update public.tournaments set round_deadline = now() + make_interval(secs => (public.game_timing()->>'betweenMatchesS')::float8)
      where id = p_tournament and status = 'in_progress';
  end if;

  perform public.notify_round_next(p_tournament);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.tick()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r record;
begin
  -- Bots: materializar las respuestas vencidas. En su propio bloque: un error acá no frena el resto.
  begin
    insert into public.penalty_answers
        (penalty_id, participant_id, option_index, selected_at, is_correct, is_random, phase)
    select bi.penalty_id, bi.participant_id, bi.chosen_option, bi.scheduled_answer_at,
           (bi.chosen_option = q.correct_index), false, bi.phase
    from public.bot_intents bi
    join public.penalties pe on pe.id = bi.penalty_id and pe.status in ('open', 'second_chance')
    join public.questions q on q.id = pe.question_id
    where not bi.materialized and bi.scheduled_answer_at <= now()
    on conflict (penalty_id, participant_id, phase) do nothing;

    update public.bot_intents bi
      set materialized = true
      from public.penalties pe
      where bi.penalty_id = pe.id and pe.status in ('open', 'second_chance')
        and not bi.materialized and bi.scheduled_answer_at <= now();
  exception when others then
    raise warning 'tick bot_intents failed: %', sqlerrm;
    perform public.ops_log('tick_error', null, jsonb_build_object('step', 'bot_intents', 'error', sqlerrm));
  end;

  -- Techos por vuelta (C4): ~500 matches → ~500 penales venciendo juntos. Orden estable (deadline, id)
  -- → los advisory locks de ronda se toman siempre en el mismo orden.
  for r in
    select id from public.penalties
    where status in ('open', 'second_chance')
      and deadline is not null
      and deadline <= now()
    order by deadline, id
    limit 1000
  loop
    begin perform public.resolve_penalty(r.id);
    exception when others then
      raise warning 'tick resolve_penalty(%) failed: %', r.id, sqlerrm;
      perform public.ops_log('tick_error', null, jsonb_build_object('step', 'resolve_penalty', 'penalty', r.id, 'error', sqlerrm));
    end;
  end loop;

  -- Watchdog (Feedback 4 #20): torneo con partidos humanos en curso, sin penal abierto y sin tiempo
  -- muerto pendiente = estado muerto (ningún camino lo destraba). Gracia: un hueco entre penales desde
  -- el último deadline, para no pisar una transición legítima. Se destraba y queda registrado.
  for r in
    select t.id from public.tournaments t
    where t.status = 'in_progress'
      and t.round_deadline is null
      and exists (
        select 1 from public.matches m
        where m.tournament_id = t.id and not m.is_bot_only and m.status in ('in_progress', 'sudden_death')
      )
      and not exists (
        select 1 from public.penalties pe join public.matches m on m.id = pe.match_id
        where m.tournament_id = t.id and pe.status in ('open', 'second_chance')
      )
      and coalesce(
        (select max(pe.deadline) from public.penalties pe join public.matches m on m.id = pe.match_id
          where m.tournament_id = t.id),
        t.created_at
      ) < now() - make_interval(secs => (public.game_timing()->>'betweenPenalsS')::float8)
    limit 100
  loop
    begin
      update public.tournaments set round_deadline = now()
        where id = r.id and status = 'in_progress' and round_deadline is null;
      perform public.ops_log('round_stall_healed', r.id, jsonb_build_object('healed_at', now()), 0);
    exception when others then
      raise warning 'tick watchdog(%) failed: %', r.id, sqlerrm;
    end;
  end loop;

  -- Tiempo muerto entre rondas vencido → abrir la próxima ronda (backstop del poke del cliente).
  for r in
    select id from public.tournaments
    where status = 'in_progress' and round_deadline is not null and round_deadline <= now()
    order by id
    limit 500
  loop
    begin perform public.open_next_round(r.id);
    exception when others then
      raise warning 'tick open_next_round(%) failed: %', r.id, sqlerrm;
      perform public.ops_log('tick_error', r.id, jsonb_build_object('step', 'open_next_round', 'error', sqlerrm));
    end;
  end loop;

  for r in
    select id from public.rooms where status = 'lobby' and starts_at <= now() limit 500
  loop
    begin perform public.start_tournament(r.id);
    exception when others then
      raise warning 'tick start_tournament(%) failed: %', r.id, sqlerrm;
      perform public.ops_log('tick_error', null, jsonb_build_object('step', 'start_tournament', 'room', r.id, 'error', sqlerrm));
    end;
  end loop;

  for r in
    select t.id from public.tournaments t
    where t.status = 'in_progress'
      and t.round_deadline is null
      and not exists (
        select 1 from public.matches m
        where m.tournament_id = t.id and m.status in ('in_progress', 'sudden_death')
      )
    limit 500
  loop
    begin perform public.advance_tournament(r.id);
    exception when others then
      raise warning 'tick advance_tournament(%) failed: %', r.id, sqlerrm;
      perform public.ops_log('tick_error', r.id, jsonb_build_object('step', 'advance_tournament', 'error', sqlerrm));
    end;
  end loop;
end;
$function$
;
