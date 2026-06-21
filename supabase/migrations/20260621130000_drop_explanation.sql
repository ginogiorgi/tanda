-- T6 — Eliminar las "curiosidades" (questions.explanation): no se llegan a ver y no suman nada.
-- Borrado TOTAL: recreamos los dos RPCs que la leían/emitían sin el campo y dropeamos la columna
-- (con sus datos). Ports fieles de las versiones vigentes (session_fixes), solo se quita explanation.

-- ── resolve_penalty: sin v_explanation (var, select y key del payload penal:result). ──
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

  if now() < v_deadline then raise exception 'too_early'; end if;

  v_phase := case v_status when 'open' then 'first' else 'second_chance' end;

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

-- ── get_penalty_result: sin v_explanation (var, select y key del payload). ──
CREATE OR REPLACE FUNCTION "public"."get_penalty_result"("p_penalty" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  uid uuid := (select auth.uid());
  v_match uuid; v_idx int; v_res jsonb; v_question uuid;
  v_correct int; v_home_score int; v_away_score int;
  v_kicker uuid; v_keeper uuid; v_k_sel timestamptz; v_g_sel timestamptz;
  v_phase public.answer_phase;
begin
  if uid is null then raise exception 'unauthenticated'; end if;

  select pe.match_id, pe.idx, pe.resolution, pe.question_id,
         pe.kicker_participant_id, pe.keeper_participant_id
    into v_match, v_idx, v_res, v_question, v_kicker, v_keeper
    from public.penalties pe
    where pe.id = p_penalty and pe.status = 'resolved';
  if v_match is null then return null; end if;  -- aún no resuelto / no existe → el cliente sigue esperando
  if not public.is_match_member(v_match) then raise exception 'not_participant'; end if;

  select q.correct_index into v_correct
    from public.questions q where q.id = v_question;
  select home_score, away_score into v_home_score, v_away_score
    from public.matches where id = v_match;

  v_phase := coalesce((v_res->>'phase')::public.answer_phase, 'first');
  select selected_at into v_k_sel from public.penalty_answers
    where penalty_id = p_penalty and participant_id = v_kicker and phase = v_phase;
  select selected_at into v_g_sel from public.penalty_answers
    where penalty_id = p_penalty and participant_id = v_keeper and phase = v_phase;

  return jsonb_build_object(
    'penalty_id', p_penalty, 'match_id', v_match, 'idx', v_idx,
    'outcome', 'resolved',
    'winner', v_res->>'winner', 'scored', (v_res->>'scored')::boolean,
    'reason', v_res->>'reason', 'variant', (v_res->>'variant')::int,
    'phase', v_res->>'phase',
    'correct_index', v_correct,
    'home_score', v_home_score, 'away_score', v_away_score,
    'won_by_speed', coalesce((v_res->>'won_by_speed')::boolean, false),
    'kicker_participant_id', v_kicker, 'keeper_participant_id', v_keeper,
    'kicker_selected_at', v_k_sel, 'keeper_selected_at', v_g_sel
  );
end;
$$;

-- ── Borrar la columna y todos sus datos. ──
ALTER TABLE "public"."questions" DROP COLUMN IF EXISTS "explanation";
