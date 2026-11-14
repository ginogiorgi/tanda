-- Regla de fase (feedback de Gino 14/11, "cuando los dos ya eligieron, que pase de una"):
--   una fase con acción termina cuando ACTUARON TODOS los que deben actuar, o al vencer su deadline,
--   lo que pase primero. Vale para todos los modos (ranked 2 humanos, salas, torneos con bots): el bot
--   "actúa" en su horario precalculado (`bot_intents`, materializado por `tick`) y la fase cierra ahí.
--   Aplica también a la 2ª oportunidad. Las fases SIN acción (entre penales/partidos, presentación)
--   siguen con duración fija (es el tiempo de la animación).
--
-- Cambios (mínimos, sobre los cuerpos de baseline_v2):
--   · `penalty_all_answered(penal, fase)` — helper interno.
--   · `resolve_penalty`: `too_early` solo si falta el deadline Y falta alguna respuesta.
--   · `select_option`: tras guardar la respuesta, si ya están las dos → resuelve (aislado).
--   · `tick`: además de los vencidos, resuelve los penales con las dos respuestas (backstop de carrera).
-- Sin cambios de datos. Idempotente (create or replace). Lock `FOR UPDATE SKIP LOCKED` intacto.

create or replace function public.penalty_all_answered(p_penalty uuid, p_phase public.answer_phase)
returns boolean
language sql stable security definer set search_path to ''
as $$
  select count(*) = 2
    from public.penalties pe
    join public.penalty_answers pa
      on pa.penalty_id = pe.id and pa.phase = p_phase
     and pa.participant_id in (pe.kicker_participant_id, pe.keeper_participant_id)
   where pe.id = p_penalty;
$$;

comment on function public.penalty_all_answered(uuid, public.answer_phase) is
  'Regla de fase: true si kicker y keeper ya respondieron en esa fase (cierre temprano del penal).';

revoke all on function public.penalty_all_answered(uuid, public.answer_phase) from public;
revoke all on function public.penalty_all_answered(uuid, public.answer_phase) from anon, authenticated;

CREATE OR REPLACE FUNCTION "public"."resolve_penalty"("p_penalty" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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

    v_new_deadline := now() + interval '5 seconds';
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
$$;

CREATE OR REPLACE FUNCTION "public"."select_option"("p_penalty" "uuid", "p_option" integer) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  uid uuid := (select auth.uid());
  v_match uuid;
  v_status public.penalty_status;
  v_started timestamptz;
  v_deadline timestamptz;
  v_removed_k int;
  v_removed_g int;
  v_kicker uuid;
  v_keeper uuid;
  v_removed int;
  v_participant uuid;
  v_phase public.answer_phase;
  v_correct int;
  v_is_correct boolean;
  v_existing int;
begin
  if uid is null then raise exception 'unauthenticated'; end if;

  select match_id, status, started_at, deadline,
         removed_option_kicker, removed_option_keeper, kicker_participant_id, keeper_participant_id
    into v_match, v_status, v_started, v_deadline, v_removed_k, v_removed_g, v_kicker, v_keeper
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

  -- Opción válida (0-2) y, en segunda chance, distinta de la quitada A ESTE jugador (tarea 10).
  if p_option < 0 or p_option > 2 then raise exception 'invalid_option'; end if;
  v_removed := case when v_participant = v_kicker then v_removed_k
                    when v_participant = v_keeper then v_removed_g end;
  if v_phase = 'second_chance' and p_option = v_removed then
    raise exception 'invalid_option';
  end if;

  -- Corrección server-only: la pregunta entra acá por SECURITY DEFINER (policy deny-all).
  select q.correct_index into v_correct
    from public.questions q
    join public.penalties pe on pe.question_id = q.id
    where pe.id = p_penalty;
  v_is_correct := (p_option = v_correct);

  -- 10.11: PRIMER TAP GANA. La respuesta deja de ser cambiable. El insert con `do nothing` es el guard
  -- autoritativo (race-safe entre llamadas concurrentes). Si no insertó, ya había una selección: si es
  -- la MISMA opción es idempotente (doble-emisión por la red → ok); si difiere, se rechaza el cambio.
  insert into public.penalty_answers
      (penalty_id, participant_id, option_index, selected_at, is_correct, is_random, phase)
    values (p_penalty, v_participant, p_option, now(), v_is_correct, false, v_phase)
  on conflict (penalty_id, participant_id, phase) do nothing;

  if not found then
    select option_index into v_existing
      from public.penalty_answers
      where penalty_id = p_penalty and participant_id = v_participant and phase = v_phase;
    if v_existing is distinct from p_option then
      raise exception 'already_answered';
    end if;
  end if;

  -- Regla de fase (feedback 14/11): si con esta respuesta ya respondieron los dos, el penal se
  -- resuelve YA (no espera los 10s). Aislado: un fallo al resolver NUNCA revierte la respuesta (el
  -- tick lo reintenta en ≤1s). Si dos respuestas llegan a la vez y ninguna ve la otra (READ
  -- COMMITTED), el backstop es el mismo: `tick()` resuelve todo penal con ambas respuestas.
  if public.penalty_all_answered(p_penalty, v_phase) then
    begin
      perform public.resolve_penalty(p_penalty);
    exception when others then
      raise warning 'select_option: resolve_penalty(%) early failed: %', p_penalty, sqlerrm;
    end;
  end if;
end;
$$;

CREATE OR REPLACE FUNCTION "public"."tick"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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

  -- Techos por vuelta (C4): dimensionados para 1000+ concurrentes (~500 matches → ~500 penales
  -- venciendo juntos). Si se superan, la próxima vuelta de pg_cron limpia el resto. El "switch" de
  -- escala mayor = pg_cron más frecuente / subir estos números (ver SPEC §C).
  for r in
    select id from public.penalties
    where status in ('open', 'second_chance')
      and deadline is not null
      and (deadline <= now()
           or public.penalty_all_answered(
                id, case status when 'open' then 'first'::public.answer_phase
                                else 'second_chance'::public.answer_phase end))
    order by deadline
    limit 1000
  loop
    begin perform public.resolve_penalty(r.id);
    exception when others then raise warning 'tick resolve_penalty(%) failed: %', r.id, sqlerrm; end;
  end loop;

  -- Tiempo muerto entre rondas vencido → abrir la próxima ronda (backstop del poke del cliente).
  for r in
    select id from public.tournaments
    where status = 'in_progress' and round_deadline is not null and round_deadline <= now()
    limit 500
  loop
    begin perform public.open_next_round(r.id);
    exception when others then raise warning 'tick open_next_round(%) failed: %', r.id, sqlerrm; end;
  end loop;

  for r in
    select id from public.rooms where status = 'lobby' and starts_at <= now() limit 500
  loop
    begin perform public.start_tournament(r.id);
    exception when others then raise warning 'tick start_tournament(%) failed: %', r.id, sqlerrm; end;
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
    exception when others then raise warning 'tick advance_tournament(%) failed: %', r.id, sqlerrm; end;
  end loop;
end;
$$;
