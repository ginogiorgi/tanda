-- Tanda — F4 / tarea 4.6: reloj de ronda compartido + barrier por penal + tiempo muerto.
--
-- Decisión (Gino, round-driven en server): los penales de una ronda (mismo idx) de TODOS los
-- matches con humanos de la jornada/fase se abren JUNTOS, en una sola transacción → comparten el
-- mismo `now()+10s` (now() es constante por transacción en Postgres) = reloj de ronda compartido
-- (SPEC §1.3). Al resolverse un penal NO se abre el siguiente del match (como antes); el barrier
-- espera a que TODOS los penales de la ronda cierren (incl. 2ª chance) y recién ahí, tras un
-- TIEMPO MUERTO (`round_deadline`, para mostrar posiciones en vivo con score:live de 6.5), abre la
-- ronda siguiente para los matches que siguen vivos. Disparo: poke `open_next_round` al terminar el
-- tiempo muerto + tick() backstop.

alter table public.tournaments add column round_deadline timestamptz;
comment on column public.tournaments.round_deadline is
  'Fin del tiempo muerto entre rondas de penales (barrier 4.6); null = no hay tiempo muerto en curso.';

-- ───────────────────────── finalize_match (finaliza sin abrir el próximo penal) ─────────────────────────
-- Mira los penales resueltos del match y corre engine_advance_match: si terminó → finished+ganador;
-- si sigue → solo marca el status (in_progress/sudden_death), SIN abrir el próximo penal (eso lo hace
-- la ronda, junta). Lo llama resolve_penalty al cerrar un penal.
create function public.finalize_match(p_match uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_phase public.match_phase; v_kind text; v_home uuid; v_away uuid; v_status public.match_status;
  v_scored boolean[]; st record;
begin
  select phase, home_participant_id, away_participant_id, status
    into v_phase, v_home, v_away, v_status
    from public.matches where id = p_match;
  if v_status = 'finished' then return; end if;
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
  else
    update public.matches
      set status = case when st.status = 'sudden_death' then 'sudden_death'::public.match_status
                        else 'in_progress'::public.match_status end
      where id = p_match and status <> 'finished';
  end if;
end;
$$;
revoke all on function public.finalize_match(uuid) from public, anon, authenticated;

-- ───────────────────────── open_round_penals (abre el penal idx-N de toda la ronda, junto) ─────────────────────────
-- Para cada match CON humano de la jornada/fase activa que no tenga un penal abierto y no haya
-- terminado, abre su próximo penal (reusa progress_match). Al correr todo en una transacción, los
-- deadlines salen idénticos = reloj de ronda compartido. Los bot-only NO entran (se simulan aparte).
create function public.open_round_penals(p_tournament uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_phase public.tournament_phase; v_slot int; r record;
begin
  select current_phase into v_phase from public.tournaments
    where id = p_tournament and status = 'in_progress';
  if v_phase is null then return; end if;

  if v_phase = 'groups' then
    select min(bracket_slot) into v_slot from public.matches
      where tournament_id = p_tournament and phase = 'group' and status <> 'finished';
    if v_slot is null then return; end if;
    for r in
      select m.id from public.matches m
      where m.tournament_id = p_tournament and m.phase = 'group' and m.bracket_slot = v_slot
        and not m.is_bot_only and m.status in ('pending', 'in_progress', 'sudden_death')
        and not exists (select 1 from public.penalties pe
                        where pe.match_id = m.id and pe.status in ('open', 'second_chance'))
    loop
      perform public.progress_match(r.id);
      perform public.emit_score_live(r.id);
    end loop;
  else
    for r in
      select m.id from public.matches m
      where m.tournament_id = p_tournament
        and (m.phase::text = v_phase::text or (v_phase = 'final' and m.phase = 'third_place'))
        and not m.is_bot_only and m.status in ('pending', 'in_progress', 'sudden_death')
        and not exists (select 1 from public.penalties pe
                        where pe.match_id = m.id and pe.status in ('open', 'second_chance'))
    loop
      perform public.progress_match(r.id);
      perform public.emit_score_live(r.id);
    end loop;
  end if;
end;
$$;
revoke all on function public.open_round_penals(uuid) from public, anon, authenticated;

-- ───────────────────────── resolve_round (barrier al cerrar toda la ronda) ─────────────────────────
-- Lo llama resolve_penalty tras cerrar un penal: si quedan penales de la ronda abiertos → no hace
-- nada (la ronda sigue). Cuando cerraron todos: si hay matches humanos sin terminar → abre el
-- tiempo muerto (round_deadline = now()+5s); si terminaron todos → avanza el torneo.
create function public.resolve_round(p_tournament uuid)
returns void language plpgsql security definer set search_path = '' as $$
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
    -- quedan matches humanos vivos → tiempo muerto antes de la próxima ronda (posiciones en vivo)
    update public.tournaments set round_deadline = now() + interval '5 seconds' where id = p_tournament;
  else
    update public.tournaments set round_deadline = null where id = p_tournament;
    perform public.advance_tournament(p_tournament);
  end if;
end;
$$;
revoke all on function public.resolve_round(uuid) from public, anon, authenticated;

-- ───────────────────────── open_next_round (abre la próxima ronda al terminar el tiempo muerto) ─────────────────────────
-- Poke del cliente al terminar el tiempo muerto (+ backstop tick). Idempotente y serializado por
-- torneo (advisory lock): solo abre si el tiempo muerto venció y no hay penales abiertos.
create function public.open_next_round(p_tournament uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare uid uuid := (select auth.uid()); v_rd timestamptz;
begin
  if uid is not null and not public.is_tournament_member(p_tournament) then
    raise exception 'not_participant';
  end if;

  perform pg_advisory_xact_lock(public.engine_hash32('tanda_round:' || p_tournament::text));

  select round_deadline into v_rd from public.tournaments
    where id = p_tournament and status = 'in_progress';
  if v_rd is null then return; end if;       -- no hay tiempo muerto en curso
  if now() < v_rd then return; end if;       -- el tiempo muerto no terminó

  if exists (
    select 1 from public.penalties pe join public.matches m on m.id = pe.match_id
    where m.tournament_id = p_tournament and not m.is_bot_only
      and pe.status in ('open', 'second_chance')
  ) then
    return;  -- defensivo: ya hay ronda abierta
  end if;

  perform public.open_round_penals(p_tournament);
  update public.tournaments set round_deadline = null where id = p_tournament;

  -- si no quedó ningún penal abierto (todos terminaron) → avanzar el torneo
  if not exists (
    select 1 from public.penalties pe join public.matches m on m.id = pe.match_id
    where m.tournament_id = p_tournament and not m.is_bot_only
      and pe.status in ('open', 'second_chance')
  ) then
    perform public.advance_tournament(p_tournament);
  end if;
end;
$$;
grant execute on function public.open_next_round(uuid) to authenticated;

-- ───────────────────────── open_round: arranca la jornada con reloj compartido ─────────────────────────
-- Simula los bot-only de la jornada/fase y abre el penal idx-1 de todos los matches con humanos
-- JUNTOS (open_round_penals → deadline compartido).
create or replace function public.open_round(p_tournament uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_phase public.tournament_phase; v_slot int; r record;
begin
  select current_phase into v_phase from public.tournaments
    where id = p_tournament and status = 'in_progress';
  if v_phase is null then return; end if;

  if v_phase = 'groups' then
    select min(bracket_slot) into v_slot from public.matches
      where tournament_id = p_tournament and phase = 'group' and status = 'pending';
    if v_slot is not null then
      for r in
        select id from public.matches
        where tournament_id = p_tournament and phase = 'group'
          and bracket_slot = v_slot and status = 'pending' and is_bot_only
      loop
        perform public.simulate_bot_match(r.id);
      end loop;
    end if;
  else
    for r in
      select id from public.matches
      where tournament_id = p_tournament and status = 'pending' and is_bot_only
        and (phase::text = v_phase::text or (v_phase = 'final' and phase = 'third_place'))
    loop
      perform public.simulate_bot_match(r.id);
    end loop;
  end if;

  perform public.open_round_penals(p_tournament);
end;
$$;
revoke all on function public.open_round(uuid) from public, anon, authenticated;

-- ───────────────────────── resolve_penalty: finalizar + barrier de ronda (no abrir el próximo) ─────────────────────────
-- (igual que score_live, pero la cola cambia: NO encadena el próximo penal del match; finaliza el
-- match si quedó decidido y deja que resolve_round coordine la ronda compartida.)
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

  -- 4.6: NO encadenar el próximo penal del match. Finalizar si quedó decidido y dejar que el
  -- barrier de ronda (resolve_round) coordine la apertura conjunta de la próxima ronda.
  perform public.finalize_match(v_match);
  perform public.emit_score_live(v_match);
  perform public.resolve_round(v_tournament);
end;
$$;

-- ───────────────────────── tick(): + backstop del tiempo muerto entre rondas ─────────────────────────
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

  -- Tiempo muerto entre rondas vencido → abrir la próxima ronda (backstop del poke del cliente).
  for r in
    select id from public.tournaments
    where status = 'in_progress' and round_deadline is not null and round_deadline <= now()
    limit 100
  loop
    begin perform public.open_next_round(r.id); exception when others then null; end;
  end loop;

  for r in
    select id from public.rooms where status = 'lobby' and starts_at <= now() limit 100
  loop
    begin perform public.start_tournament(r.id); exception when others then null; end;
  end loop;

  for r in
    select t.id from public.tournaments t
    where t.status = 'in_progress'
      and t.round_deadline is null
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
revoke all on function public.tick() from public, anon, authenticated;
