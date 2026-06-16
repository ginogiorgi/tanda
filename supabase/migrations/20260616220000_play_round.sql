-- Tanda — F6 / tarea 6.4 (b) + progresión de fase de grupos.
--
-- Hace jugable una jornada: abre los penales de los matches CON humanos (1 pregunta por
-- (ronda, penal-index) COMPARTIDA), simula los bot-only al instante, encadena los penales dentro
-- del match (al resolver uno se abre el siguiente) y avanza de jornada cuando la actual terminó.
-- El armado de los grupos → KO (standings/bracket) y las rondas de eliminación quedan para 6.4(c).
--
-- Camino autoritativo, todo PLPGSQL (SPEC §1.2). Disparo event-driven: resolve_penalty → progresa
-- el match → avanza el torneo; tick() como backstop (penales vencidos + lobbies + torneos trabados).

-- ───────────────────────── open_penalty_internal (apertura sin auth) ─────────────────────────
-- Núcleo de la apertura de un penal: lo usa el flujo autoritativo (progress_match/open_round),
-- que corre server-side (uid puede ser null). `open_penalty` (cliente/dev) valida auth y delega.
create function public.open_penalty_internal(p_penalty uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_match uuid; v_idx int; v_difficulty public.difficulty;
  v_started timestamptz; v_deadline timestamptz; v_prompt text; v_options jsonb;
begin
  update public.penalties
    set status = 'open', started_at = now(), deadline = now() + interval '10 seconds'
    where id = p_penalty and status = 'pending'
    returning match_id, idx, difficulty, started_at, deadline
    into v_match, v_idx, v_difficulty, v_started, v_deadline;
  if v_started is null then return; end if;  -- no estaba pending → no-op

  select q.prompt, q.options into v_prompt, v_options
    from public.questions q join public.penalties pe on pe.question_id = q.id
    where pe.id = p_penalty;

  perform realtime.send(
    jsonb_build_object(
      'penalty_id', p_penalty, 'match_id', v_match, 'idx', v_idx,
      'prompt', v_prompt, 'options', v_options, 'difficulty', v_difficulty,
      'started_at', v_started, 'deadline', v_deadline, 'server_now', now()
    ),
    'penal:start', 'match:' || v_match::text, true
  );
  perform public.precompute_bot_intents(p_penalty);
end;
$$;
revoke all on function public.open_penalty_internal(uuid) from public, anon, authenticated;

create or replace function public.open_penalty(p_penalty uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare uid uuid := (select auth.uid()); v_match uuid;
begin
  if uid is null then raise exception 'unauthenticated'; end if;
  select match_id into v_match from public.penalties where id = p_penalty;
  if v_match is null then raise exception 'penalty_not_found'; end if;
  if not public.is_match_member(v_match) then raise exception 'not_participant'; end if;
  perform public.open_penalty_internal(p_penalty);
end;
$$;

-- ───────────────────────── assign_round_question (1 pregunta por ronda+idx) ─────────────────────────
-- Devuelve la pregunta para el penal `idx` de la RONDA de este match, COMPARTIDA por todos los
-- matches de esa ronda: si ya la eligió otro match de la misma ronda+idx, la reusa; si no, la toma
-- del banco (no-repeat intra-torneo). Ronda = jornada en grupos (bracket_slot); = fase en KO.
create function public.assign_round_question(p_match uuid, p_idx int)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_tournament uuid; v_phase public.match_phase; v_slot int; v_seed bigint;
  v_q uuid; v_diff public.difficulty;
begin
  select m.tournament_id, m.phase, m.bracket_slot, t.seed
    into v_tournament, v_phase, v_slot, v_seed
    from public.matches m join public.tournaments t on t.id = m.tournament_id
    where m.id = p_match;

  select pe.question_id into v_q
    from public.penalties pe join public.matches m2 on m2.id = pe.match_id
    where m2.tournament_id = v_tournament and m2.phase = v_phase
      and (v_phase <> 'group' or m2.bracket_slot is not distinct from v_slot)
      and pe.idx = p_idx and pe.question_id is not null
    limit 1;
  if v_q is not null then return v_q; end if;

  v_diff := public.tanda_penalty_difficulty(v_phase, p_idx);
  v_q := public.take_tournament_question(
    v_tournament, v_diff,
    (coalesce(v_seed, 0) # public.engine_hash32(v_phase::text || ':' || coalesce(v_slot, 0) || ':' || p_idx)) & 4294967295
  );
  return v_q;
end;
$$;
revoke all on function public.assign_round_question(uuid, int) from public, anon, authenticated;

-- ───────────────────────── progress_match (encadena penales / cierra el match) ─────────────────────────
-- Mira los penales resueltos del match, corre engine_advance_match y: si terminó → match finished
-- (+ ganador); si sigue → crea (si falta) y abre el penal next_index. Lo llama open_round (arranque,
-- 0 penales → abre idx 1) y resolve_penalty (al cerrar un penal → encadena el siguiente).
create function public.progress_match(p_match uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_phase public.match_phase; v_kind text; v_home uuid; v_away uuid; v_status public.match_status;
  v_scored boolean[]; st record; v_idx int; v_kicker uuid; v_keeper uuid;
  v_q uuid; v_diff public.difficulty; v_pen uuid;
begin
  select phase, home_participant_id, away_participant_id, status
    into v_phase, v_home, v_away, v_status
    from public.matches where id = p_match;
  if v_home is null or v_away is null then raise exception 'match_incomplete'; end if;
  if v_status = 'finished' then return 'finished'; end if;
  v_kind := case when v_phase = 'group' then 'group' else 'elimination' end;

  select coalesce(array_agg((resolution->>'scored')::boolean order by idx), '{}')
    into v_scored
    from public.penalties where match_id = p_match and status = 'resolved';

  select * into st from public.engine_advance_match(v_kind, v_scored);

  if st.status = 'finished' then
    update public.matches
      set status = 'finished',
          winner_participant_id = case st.winner when 'home' then v_home when 'away' then v_away else null end
      where id = p_match;
    return 'finished';
  end if;

  v_idx := st.next_index;
  if st.next_kicker = 'home' then v_kicker := v_home; v_keeper := v_away;
  else v_kicker := v_away; v_keeper := v_home; end if;

  select id into v_pen from public.penalties where match_id = p_match and idx = v_idx;
  if v_pen is null then
    v_q := public.assign_round_question(p_match, v_idx);
    v_diff := public.tanda_penalty_difficulty(v_phase, v_idx);
    insert into public.penalties
        (match_id, idx, kicker_participant_id, keeper_participant_id, question_id, difficulty, status)
      values (p_match, v_idx, v_kicker, v_keeper, v_q, v_diff, 'pending')
      returning id into v_pen;
  end if;

  update public.matches
    set status = case when st.status = 'sudden_death' then 'sudden_death'::public.match_status
                      else 'in_progress'::public.match_status end
    where id = p_match and status <> 'finished';

  perform public.open_penalty_internal(v_pen);
  return st.status;
end;
$$;
revoke all on function public.progress_match(uuid) from public, anon, authenticated;

-- ───────────────────────── open_round (abre/juega la ronda actual) ─────────────────────────
create function public.open_round(p_tournament uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_phase public.tournament_phase; v_round int; r record;
begin
  select current_phase into v_phase from public.tournaments
    where id = p_tournament and status = 'in_progress';
  if v_phase is null then return; end if;

  if v_phase = 'groups' then
    select min(bracket_slot) into v_round from public.matches
      where tournament_id = p_tournament and phase = 'group' and status = 'pending';
    if v_round is null then return; end if;
    for r in
      select id, is_bot_only from public.matches
      where tournament_id = p_tournament and phase = 'group'
        and bracket_slot = v_round and status = 'pending'
    loop
      if r.is_bot_only then perform public.simulate_bot_match(r.id);
      else perform public.progress_match(r.id); end if;
    end loop;
  else
    -- KO: la fase 'final' incluye el partido por el 3er puesto.
    for r in
      select id, is_bot_only from public.matches
      where tournament_id = p_tournament and status = 'pending'
        and (phase::text = v_phase::text or (v_phase = 'final' and phase = 'third_place'))
    loop
      if r.is_bot_only then perform public.simulate_bot_match(r.id);
      else perform public.progress_match(r.id); end if;
    end loop;
  end if;
end;
$$;
revoke all on function public.open_round(uuid) from public, anon, authenticated;

-- ───────────────────────── advance_tournament (gate por fase) ─────────────────────────
-- Grupos: abre la próxima jornada cuando la actual terminó (3 jornadas). El paso grupos→KO y las
-- rondas de eliminación son 6.4(c) (TODO). Idempotente: si hay un match en curso, no hace nada.
create function public.advance_tournament(p_tournament uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_phase public.tournament_phase;
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
        continue;  -- re-evaluar (si la jornada abierta es toda bot-only, sigue a la próxima)
      else
        return;  -- grupos completos → grupos→KO es 6.4(c)
      end if;
    else
      return;  -- KO es 6.4(c)
    end if;
  end loop;
end;
$$;
revoke all on function public.advance_tournament(uuid) from public, anon, authenticated;

-- ───────────────────────── start_tournament: arrancar la 1ª jornada ─────────────────────────
create or replace function public.start_tournament(p_room uuid)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_letters constant text[] := array['A','B','C','D','E','F','G','H','I','J','K','L'];
  v_tournament uuid;
  v_seed bigint;
  v_humans int;
begin
  select t.id, t.seed into v_tournament, v_seed
    from public.tournaments t
    where t.room_id = p_room and t.status = 'pending'
    for update skip locked;
  if v_tournament is null then return; end if;

  select count(*) into v_humans
    from public.participants where tournament_id = v_tournament and is_bot = false;

  if v_humans = 0 then
    update public.rooms set status = 'cancelled' where id = p_room;
    return;
  end if;

  update public.rooms set status = 'starting' where id = p_room;

  with h as (
    select id, row_number() over (order by created_at, id) as rn
    from public.participants
    where tournament_id = v_tournament and is_bot = false
  )
  update public.participants p
    set group_letter = v_letters[((h.rn - 1) % 12) + 1]
    from h where p.id = h.id;

  insert into public.participants (tournament_id, user_id, is_bot, group_letter)
  select v_tournament, null, true, g.letter
  from (select unnest(v_letters) as letter) g
  cross join lateral generate_series(
    1,
    4 - (select count(*) from public.participants
         where tournament_id = v_tournament and group_letter = g.letter)
  );

  with parts as (
    select id, row_number() over (order by md5(v_seed::text || ':' || id::text)) as rn
    from public.participants where tournament_id = v_tournament
  ),
  nats as (
    select id as nation_id, row_number() over (order by md5(v_seed::text || ':' || id::text)) as rn
    from public.nations
  )
  update public.participants p
    set nation_id = nats.nation_id
    from parts join nats on nats.rn = parts.rn
    where p.id = parts.id;

  with ps as (
    select id, group_letter, is_bot,
           row_number() over (
             partition by group_letter order by md5(v_seed::text || ':' || id::text)
           ) as rn
    from public.participants where tournament_id = v_tournament
  )
  insert into public.matches
    (tournament_id, phase, group_letter, bracket_slot,
     home_participant_id, away_participant_id, is_bot_only, status)
  select v_tournament, 'group', h.group_letter, pair.md,
         h.id, a.id, (h.is_bot and a.is_bot), 'pending'
  from (values (1,4,1),(2,3,1),(1,3,2),(4,2,2),(1,2,3),(3,4,3)) as pair(hr, ar, md)
  join ps h on h.rn = pair.hr
  join ps a on a.rn = pair.ar and a.group_letter = h.group_letter;

  update public.tournaments set status = 'in_progress', current_phase = 'groups'
    where id = v_tournament;
  update public.rooms set status = 'in_progress' where id = p_room;

  -- 6.4(b): arrancar la 1ª jornada (bot-only al instante, humanos abren su 1er penal).
  perform public.advance_tournament(v_tournament);
end;
$$;

-- ───────────────────────── resolve_penalty: encadenar match + avanzar torneo ─────────────────────────
create or replace function public.resolve_penalty(p_penalty uuid)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  v_match uuid; v_idx int; v_status public.penalty_status;
  v_deadline timestamptz; v_question uuid; v_kicker uuid; v_keeper uuid;
  v_tournament uuid; v_t_seed bigint; v_seed bigint;
  v_correct int; v_prompt text; v_options jsonb; v_explanation text;
  v_phase public.answer_phase;
  v_home uuid; v_away uuid; v_home_score int; v_away_score int;
  v_k_ans record; v_g_ans record;
  v_k_ok boolean; v_g_ok boolean;
  v_winner text; v_reason text; v_scored boolean; v_variant int;
  v_removed int; v_wrong int[]; v_kw int; v_gw int;
  v_part uuid; v_new_deadline timestamptz;
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

  if now() < v_deadline then raise exception 'too_early'; end if;

  v_phase := case v_status when 'open' then 'first' else 'second_chance' end;

  select t.id, t.seed into v_tournament, v_t_seed
    from public.matches m join public.tournaments t on t.id = m.tournament_id
    where m.id = v_match;
  v_seed := (coalesce(v_t_seed, 0) # public.engine_hash32(v_match::text || ':' || v_idx)) & 4294967295;

  select q.correct_index, q.prompt, q.options, q.explanation
    into v_correct, v_prompt, v_options, v_explanation
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
      v_winner := 'kicker'; v_reason := 'goal';
    elsif v_g_ans.selected_at < v_k_ans.selected_at then
      v_winner := 'keeper'; v_reason := 'save';
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
    select array_agg(i order by i) into v_wrong
      from generate_series(0, 2) i where i <> v_correct;
    v_kw := case when v_k_ans.option_index <> v_correct then v_k_ans.option_index end;
    v_gw := case when v_g_ans.option_index <> v_correct then v_g_ans.option_index end;
    if v_kw is not null and v_kw = v_gw then
      v_removed := v_kw;
    else
      v_removed := v_wrong[public.engine_rand_int(v_seed, 2) + 1];
    end if;

    v_new_deadline := now() + interval '5 seconds';
    update public.penalties
      set status = 'second_chance', second_chance = true, removed_option = v_removed,
          started_at = now(), deadline = v_new_deadline
      where id = p_penalty;

    perform realtime.send(
      jsonb_build_object(
        'penalty_id', p_penalty, 'match_id', v_match, 'idx', v_idx,
        'prompt', v_prompt, 'options', v_options, 'removed_option', v_removed,
        'phase', 'second_chance', 'started_at', now(), 'deadline', v_new_deadline,
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
          'variant', v_variant, 'phase', v_phase
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
      'correct_index', v_correct, 'explanation', v_explanation,
      'home_score', v_home_score, 'away_score', v_away_score
    ),
    'penal:result', 'match:' || v_match::text, true
  );

  -- 6.4(b): encadenar el match (abrir el siguiente penal o cerrarlo) y avanzar el torneo.
  perform public.progress_match(v_match);
  perform public.advance_tournament(v_tournament);
end;
$$;

-- ───────────────────────── tick(): backstop completo ─────────────────────────
-- (a) intents de bots vencidos, (b) penales abiertos vencidos, (c) lobbies vencidos → start,
-- (d) torneos en curso sin match en juego → advance (rondas all-bot / destrabar).
create or replace function public.tick()
returns void
language plpgsql security definer set search_path = '' as $$
declare r record;
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

  for r in
    select id from public.penalties
    where status in ('open', 'second_chance')
      and deadline is not null and deadline <= now()
    order by deadline
    limit 200
  loop
    begin perform public.resolve_penalty(r.id); exception when others then null; end;
  end loop;

  for r in
    select id from public.rooms where status = 'lobby' and starts_at <= now() limit 100
  loop
    begin perform public.start_tournament(r.id); exception when others then null; end;
  end loop;

  for r in
    select t.id from public.tournaments t
    where t.status = 'in_progress'
      and not exists (
        select 1 from public.matches m
        where m.tournament_id = t.id and m.status in ('in_progress', 'sudden_death')
      )
    limit 100
  loop
    begin perform public.advance_tournament(r.id); exception when others then null; end;
  end loop;
end;
$$;
