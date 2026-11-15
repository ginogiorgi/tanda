-- Tiempos de juego en una sola fuente (feedback 2, P3). Antes: ~14 `interval '…'` sueltos en 6
-- migraciones y la UI repitiendo algunos de memoria (así se coló el "2 minutos" de errors.ts).
--  · `public.game_timing()` = espejo de `TIMING` (lib/engine/timing.ts); paridad en
--    supabase/tests/timing.test.ts. Inmutable y versionada en git (nadie la edita en caliente).
--  · La espera de sala es por modo: `game_modes.lobby_seconds` (30 s, con amigos y partida rápida).
--  · Las RPC de abajo son las definiciones vigentes con cada literal reemplazado por la key de
--    `game_timing()`; nada más cambia. `pnpm db:check-migrations` prohíbe `interval 'N seconds'` nuevos.

create or replace function public.game_timing()
returns jsonb
language sql immutable parallel safe set search_path to ''
as $$
  select jsonb_build_object(
    'penaltyS', 10, 'secondChanceS', 5, 'betweenPenalsS', 3, 'betweenMatchesS', 7,
    'presentationS', 7, 'presentationBackstopS', 10, 'groupsCloseS', 4, 'bracketLeadInS', 4,
    'koGapS', 2, 'rankedVersusS', 8, 'queuePresenceS', 8, 'queuePurgeS', 15)
$$;
revoke execute on function public.game_timing() from public, anon, authenticated;

alter table public.game_modes
  add column lobby_seconds int not null default 30 check (lobby_seconds between 10 and 600);

CREATE OR REPLACE FUNCTION public.advance_tournament(p_tournament uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_phase public.tournament_phase; v_pending int; v_total int; v_unfinished int;
  v_phase_after public.tournament_phase; v_groups_closed_at timestamptz;
begin
  loop
    select current_phase into v_phase from public.tournaments
      where id = p_tournament and status = 'in_progress';
    if v_phase is null then return; end if;

    if v_phase = 'groups' then
      if exists (select 1 from public.matches
                 where tournament_id = p_tournament and phase = 'group'
                   and status in ('in_progress', 'sudden_death')) then
        return;  -- jornada en curso
      end if;
      if exists (select 1 from public.matches
                 where tournament_id = p_tournament and phase = 'group' and status = 'pending') then
        perform public.open_round(p_tournament);  -- abre la próxima jornada
        continue;
      else
        -- Grupos completos. Enfoque B (T11): NO armar el bracket todavía.
        select groups_closed_at into v_groups_closed_at from public.tournaments
          where id = p_tournament;
        if v_groups_closed_at is null then
          -- 1ª llegada: ventana de 4s sobre los grupos finales (current_phase sigue 'groups').
          update public.tournaments
            set groups_closed_at = now(), round_deadline = now() + make_interval(secs => (public.game_timing()->>'groupsCloseS')::int)
            where id = p_tournament and status = 'in_progress';
          perform public.notify_round_next(p_tournament);
          return;
        else
          -- Ventana cumplida: armar el bracket + lead-in de 4s para ver los cruces (T7).
          perform public.build_knockout(p_tournament);
          update public.tournaments set round_deadline = now() + make_interval(secs => (public.game_timing()->>'bracketLeadInS')::int)
            where id = p_tournament and status = 'in_progress';
          perform public.notify_round_next(p_tournament);
          return;
        end if;
      end if;
    end if;

    -- Fases de eliminación (la 'final' incluye el 3er puesto).
    if exists (select 1 from public.matches m
               where m.tournament_id = p_tournament and m.status in ('in_progress', 'sudden_death')
                 and (m.phase::text = v_phase::text or (v_phase = 'final' and m.phase = 'third_place'))) then
      return;  -- partido en curso
    end if;

    select count(*) filter (where status = 'pending'),
           count(*),
           count(*) filter (where status <> 'finished')
      into v_pending, v_total, v_unfinished
      from public.matches m
      where m.tournament_id = p_tournament
        and (m.phase::text = v_phase::text or (v_phase = 'final' and m.phase = 'third_place'));

    if v_total = 0 then
      return;  -- defensivo: la fase aún no tiene matches
    elsif v_pending > 0 then
      perform public.open_round(p_tournament);  -- abre los pendientes (bot-only al instante)
      continue;
    elsif v_unfinished = 0 then
      perform public.advance_ko_round(p_tournament);  -- ronda completa → siguiente / corona
      select current_phase into v_phase_after from public.tournaments
        where id = p_tournament and status = 'in_progress';
      -- ¿Se armó una fase nueva (no la final ya coronada)? → lead-in para ver el bracket/rival.
      if v_phase_after is not null and v_phase_after is distinct from v_phase then
        update public.tournaments set round_deadline = now() + make_interval(secs => (public.game_timing()->>'koGapS')::int)
          where id = p_tournament and status = 'in_progress';
        perform public.notify_round_next(p_tournament);
        return;
      end if;
      continue;
    else
      return;
    end if;
  end loop;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.begin_presentation(p_tournament uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare uid uuid := (select auth.uid());
begin
  if uid is null then raise exception 'unauthenticated'; end if;
  if not public.is_tournament_member(p_tournament) then raise exception 'not_participant'; end if;

  perform pg_advisory_xact_lock(public.engine_hash32('tanda_round:' || p_tournament::text));

  update public.tournaments
    set round_deadline = least(round_deadline, now() + make_interval(secs => (public.game_timing()->>'presentationS')::int))
    where id = p_tournament and status = 'in_progress' and current_phase = 'groups'
      and round_deadline is not null
      and not exists (
        select 1 from public.penalties pe
        join public.matches m on m.id = pe.match_id
        where m.tournament_id = p_tournament
      );

  perform public.notify_round_next(p_tournament);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.create_room(p_mode text DEFAULT 'worldcup'::text)
 RETURNS TABLE(room_id uuid, tournament_id uuid, code text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  uid uuid := (select auth.uid());
  v_room uuid; v_tournament uuid; v_code text;
begin
  if uid is null then raise exception 'unauthenticated'; end if;
  if not exists (select 1 from public.game_modes gm where gm.id = p_mode and gm.active) then
    raise exception 'invalid_mode';
  end if;
  perform public.enforce_rate_limit('create_room', 10, interval '1 minute');
  v_code := public.gen_room_code();
  insert into public.rooms (code, host_id, status, starts_at, mode_id)
    values (v_code, uid, 'lobby', now() + make_interval(secs => (select gm.lobby_seconds from public.game_modes gm where gm.id = p_mode)), p_mode)
    returning id into v_room;
  insert into public.tournaments (room_id, status, current_phase, seed, mode_id)
    values (v_room, 'pending', 'groups', (random() * 9.2e18)::bigint, p_mode)
    returning id into v_tournament;
  insert into public.participants (tournament_id, user_id, is_bot)
    values (v_tournament, uid, false);
  return query select v_room, v_tournament, v_code;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.open_penalty_internal(p_penalty uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_match uuid; v_idx int; v_difficulty public.difficulty;
  v_started timestamptz; v_deadline timestamptz; v_prompt text; v_options jsonb;
  v_kicker uuid; v_keeper uuid;
begin
  update public.penalties
    set status = 'open', started_at = now(), deadline = now() + make_interval(secs => (public.game_timing()->>'penaltyS')::int)
    where id = p_penalty and status = 'pending'
    returning match_id, idx, difficulty, started_at, deadline,
              kicker_participant_id, keeper_participant_id
    into v_match, v_idx, v_difficulty, v_started, v_deadline, v_kicker, v_keeper;
  if v_started is null then return; end if;  -- no estaba pending → no-op

  select q.prompt, q.options into v_prompt, v_options
    from public.questions q join public.penalties pe on pe.question_id = q.id
    where pe.id = p_penalty;

  perform realtime.send(
    jsonb_build_object(
      'penalty_id', p_penalty, 'match_id', v_match, 'idx', v_idx,
      'prompt', v_prompt, 'options', v_options, 'difficulty', v_difficulty,
      'started_at', v_started, 'deadline', v_deadline, 'server_now', now(),
      'kicker_participant_id', v_kicker, 'keeper_participant_id', v_keeper
    ),
    'penal:start', 'match:' || v_match::text, true
  );
  perform public.precompute_bot_intents(p_penalty);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.ranked_create_match(p_home uuid, p_away uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_room uuid; v_t uuid; v_ph uuid; v_pa uuid;
  h public.ranked_players; a public.ranked_players;
  hw record; hl record; aw record; al record;
begin
  h := public.ranked_ensure_player(p_home);
  a := public.ranked_ensure_player(p_away);

  insert into public.rooms (code, host_id, status, starts_at, mode_id)
    values (public.gen_room_code(), p_home, 'in_progress', now(), 'ranked')
    returning id into v_room;
  -- Cara a cara (rankedVersusS) (cara a cara + lo que está en juego) antes del primer penal.
  insert into public.tournaments (room_id, status, current_phase, seed, mode_id, round_deadline)
    values (v_room, 'in_progress', 'final', (random() * 9.2e18)::bigint, 'ranked', now() + make_interval(secs => (public.game_timing()->>'rankedVersusS')::int))
    returning id into v_t;
  insert into public.participants (tournament_id, user_id, is_bot) values (v_t, p_home, false) returning id into v_ph;
  insert into public.participants (tournament_id, user_id, is_bot) values (v_t, p_away, false) returning id into v_pa;
  insert into public.matches (tournament_id, phase, bracket_slot, home_participant_id, away_participant_id, is_bot_only, status)
    values (v_t, 'final', 0, v_ph, v_pa, false, 'pending');

  select * into hw from public.ranked_apply_result(h.rating, h.shield, a.rating, true);
  select * into hl from public.ranked_apply_result(h.rating, h.shield, a.rating, false);
  select * into aw from public.ranked_apply_result(a.rating, a.shield, h.rating, true);
  select * into al from public.ranked_apply_result(a.rating, a.shield, h.rating, false);

  insert into public.ranked_matches
    (tournament_id, season_id, home_user, away_user, home_participant, away_participant,
     home_rating, away_rating, home_stakes, away_stakes, avg_rating)
  values
    (v_t, h.season_id, p_home, p_away, v_ph, v_pa, h.rating, a.rating,
     jsonb_build_object('win', hw.delta, 'loss', hl.delta),
     jsonb_build_object('win', aw.delta, 'loss', al.delta),
     (h.rating + a.rating) / 2);

  delete from public.ranked_queue where user_id in (p_home, p_away);
  return v_t;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.ranked_poll()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  uid uuid := (select auth.uid()); v_t uuid; v_enq timestamptz; v_rating int; v_waited float8;
begin
  if uid is null then raise exception 'unauthenticated'; end if;

  v_t := public.ranked_active_tournament(uid);
  if v_t is not null then
    return jsonb_build_object('status', 'matched', 'tournament_id', v_t);
  end if;

  update public.ranked_queue set last_seen = now() where user_id = uid
    returning enqueued_at, rating into v_enq, v_rating;
  if v_enq is null then return jsonb_build_object('status', 'idle'); end if;

  v_t := public.ranked_try_match(uid);
  if v_t is not null then
    return jsonb_build_object('status', 'matched', 'tournament_id', v_t);
  end if;

  v_waited := extract(epoch from now() - v_enq);
  return jsonb_build_object(
    'status', 'queued',
    'waited_ms', (v_waited * 1000)::bigint,
    'rating', v_rating,
    'in_queue', (select count(*) from public.ranked_queue q where q.last_seen > now() - make_interval(secs => (public.game_timing()->>'queuePresenceS')::int)),
    'server_now', now()
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.ranked_try_match(p_user uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  me public.ranked_queue; v_last uuid; v_opp public.ranked_queue; v_w int;
begin
  perform pg_advisory_xact_lock(hashtext('tanda_ranked_matchmaking'));

  select * into me from public.ranked_queue where user_id = p_user;
  if me.user_id is null then
    return public.ranked_active_tournament(p_user);  -- ya lo emparejó otro
  end if;
  select last_opponent into v_last from public.ranked_players where user_id = p_user;
  v_w := public.ranked_queue_window(extract(epoch from now() - me.enqueued_at));

  select q.* into v_opp
  from public.ranked_queue q
  where q.user_id <> p_user
    and q.last_seen > now() - make_interval(secs => (public.game_timing()->>'queuePresenceS')::int)
    and (
      v_w is null
      or public.ranked_queue_window(extract(epoch from now() - q.enqueued_at)) is null
      or abs(q.rating - me.rating) <= greatest(v_w, public.ranked_queue_window(extract(epoch from now() - q.enqueued_at)))
    )
  order by (q.user_id is not distinct from v_last), q.enqueued_at
  limit 1;

  if v_opp.user_id is null then return null; end if;

  -- Local = el que más esperó.
  if v_opp.enqueued_at <= me.enqueued_at then
    return public.ranked_create_match(v_opp.user_id, p_user);
  end if;
  return public.ranked_create_match(p_user, v_opp.user_id);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.ranked_tick()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r record;
begin
  perform public.ranked_roll_season(null);
  delete from public.ranked_queue where last_seen < now() - make_interval(secs => (public.game_timing()->>'queuePurgeS')::int);
  for r in select user_id from public.ranked_queue order by enqueued_at limit 200 loop
    begin perform public.ranked_try_match(r.user_id);
    exception when others then raise warning 'ranked_tick try_match(%) failed: %', r.user_id, sqlerrm; end;
  end loop;
end;
$function$
;

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

  -- Regla de fase (feedback 14/11): se resuelve al vencer el deadline O apenas respondieron los dos.
  if now() < v_deadline and not public.penalty_all_answered(p_penalty, v_phase) then
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
    -- DENTRO del match: próximo penal del mismo match (10.2) → tiempo muerto = animación (3s).
    update public.tournaments set round_deadline = now() + make_interval(secs => (public.game_timing()->>'betweenPenalsS')::int)
      where id = p_tournament and status = 'in_progress';
  else
    -- ENTRE matches → animación del último penal + ~4s para ver la tabla/grupo (10.3). T10: 6s → 7s.
    update public.tournaments set round_deadline = now() + make_interval(secs => (public.game_timing()->>'betweenMatchesS')::int)
      where id = p_tournament and status = 'in_progress';
  end if;

  perform public.notify_round_next(p_tournament);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.start_tournament(p_room uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_tournament uuid; v_seed bigint; v_humans int; v_mode public.game_modes;
  v_letters text[]; v_teams int;
begin
  select t.id, t.seed into v_tournament, v_seed
    from public.tournaments t
    where t.room_id = p_room and t.status = 'pending'
    for update skip locked;
  if v_tournament is null then return; end if;

  select gm.* into v_mode from public.game_modes gm
    join public.tournaments t on t.mode_id = gm.id where t.id = v_tournament;

  select count(*) into v_humans from public.participants where tournament_id = v_tournament and is_bot = false;
  if v_humans = 0 then
    update public.rooms set status = 'cancelled' where id = p_room;
    return;
  end if;

  select count(*) into v_teams from public.teams where mode_id = v_mode.id;
  if v_teams < v_mode.room_size then raise exception 'mode_catalog_incomplete' using detail = v_mode.id; end if;

  update public.rooms set status = 'starting' where id = p_room;

  v_letters := array(select chr(64 + g) from generate_series(1, v_mode.zones) g);

  -- Humanos repartidos round-robin entre zonas (por orden de llegada); bots completan cada zona.
  with h as (
    select id, row_number() over (order by created_at, id) as rn
    from public.participants where tournament_id = v_tournament and is_bot = false
  )
  update public.participants p
    set group_letter = v_letters[((h.rn - 1) % v_mode.zones) + 1]
    from h where p.id = h.id;

  insert into public.participants (tournament_id, user_id, is_bot, group_letter)
  select v_tournament, null, true, g.letter
  from (select unnest(v_letters) as letter) g
  cross join lateral generate_series(
    1,
    v_mode.zone_size - (select count(*) from public.participants
                        where tournament_id = v_tournament and group_letter = g.letter)
  );

  -- Equipos del modo, 1:1 por sorteo (seed). Con room_size equipos exactos, todos juegan.
  with parts as (
    select id, row_number() over (order by md5(v_seed::text || ':' || id::text)) as rn
    from public.participants where tournament_id = v_tournament
  ),
  tms as (
    select id as team_id, row_number() over (order by md5(v_seed::text || ':' || id::text)) as rn
    from public.teams where mode_id = v_mode.id
  )
  update public.participants p
    set team_id = tms.team_id
    from parts join tms on tms.rn = parts.rn
    where p.id = parts.id;

  -- Fixture por zona (método del círculo) sobre posiciones sorteadas (pos 1..zone_size por zona).
  insert into public.matches
    (tournament_id, phase, group_letter, bracket_slot, home_participant_id, away_participant_id, is_bot_only, status)
  with pos as (
    select id, group_letter, is_bot,
           row_number() over (partition by group_letter order by md5(v_seed::text || ':' || id::text))::int as pos
    from public.participants where tournament_id = v_tournament
  )
  select v_tournament, 'group', h.group_letter, rr.md, h.id, a.id, (h.is_bot and a.is_bot), 'pending'
  from public.engine_round_robin(v_mode.zone_size, v_mode.matchdays) rr
  join pos h on h.pos = rr.home_pos
  join pos a on a.pos = rr.away_pos and a.group_letter = h.group_letter
  where rr.away_pos > 0;

  -- Zonas impares: los LIBRES de cada fecha juegan un interzonal (zona 1 vs 2, 3 vs 4…).
  -- group_letter null = interzonal; suma para la tabla de la zona de cada uno.
  if v_mode.zone_size % 2 = 1 then
    insert into public.matches
      (tournament_id, phase, group_letter, bracket_slot, home_participant_id, away_participant_id, is_bot_only, status)
    with pos as (
      select id, group_letter, is_bot,
             row_number() over (partition by group_letter order by md5(v_seed::text || ':' || id::text))::int as pos
      from public.participants where tournament_id = v_tournament
    ),
    byes as (
      select rr.md, p.id, p.is_bot, array_position(v_letters, p.group_letter) as zi
      from public.engine_round_robin(v_mode.zone_size, v_mode.matchdays) rr
      join pos p on p.pos = rr.home_pos
      where rr.away_pos = 0
    )
    select v_tournament, 'group', null, h.md,
           -- alterna la localía por fecha
           case when h.md % 2 = 1 then h.id else a.id end,
           case when h.md % 2 = 1 then a.id else h.id end,
           (h.is_bot and a.is_bot), 'pending'
    from byes h join byes a on a.md = h.md and a.zi = h.zi + 1 and h.zi % 2 = 1;
  end if;

  update public.tournaments set status = 'in_progress', current_phase = 'groups' where id = v_tournament;
  update public.rooms set status = 'in_progress' where id = p_room;

  -- Backstop de presentación (la ventana real la fija begin_presentation al llegar el humano).
  update public.tournaments set round_deadline = now() + make_interval(secs => (public.game_timing()->>'presentationBackstopS')::int) where id = v_tournament;
end;
$function$
;
