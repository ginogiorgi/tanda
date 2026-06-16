-- Tanda — F5 / tarea 5.3: `bot_intents` precomputados/materializados.
--
-- Hasta ahora `resolve_penalty` le daba a TODO no-respondedor una opción aleatoria. Los bots no
-- deben jugar al azar: siguen el modelo de dificultad por nación (§7.2), que ya vive en
-- `lib/engine/bot.ts` (`botIntent`). Acá se PORTA ese modelo a plpgsql (verificado por PARIDAD,
-- igual que `resolvePenalty`/RNG en 4.5) y se enchufa en el flujo:
--   1) `engine_bot_intent(tier, seed)` → {will_be_correct, delay_ms} — port fiel de botIntent.
--   2) `precompute_bot_intents(penalty)` — al abrir un penal (o entrar en segunda chance), calcula
--      para cada bot del match su intención: cuándo responde (scheduled_answer_at), si acierta y
--      qué opción elige. Determinista por el seed del torneo (reproducible).
--   3) `materialize_bot_intents(penalty, force)` — vuelca las intenciones a `penalty_answers`
--      (las vencidas, o todas si force). La usa el tick (intents vencidos durante la ventana) y
--      `resolve_penalty` (force, al resolver) para que los bots tengan su respuesta del modelo,
--      no random.
-- `resolve_penalty` sigue dando random SOLO a humanos ausentes/desconectados (§3.1). Cubre
-- primera fase, segunda chance y muerte súbita (cada penal nuevo de súbita pasa por open_penalty).

-- ───────────────────────── engine_bot_intent (port de lib/engine/bot.ts) ─────────────────────────
-- will_be_correct = makeRng(seed)() < accuracy  ⇔  mulberry32(seed) < accuracy*2^32.
-- delay_ms = minDelay + floor(makeRng((seed ^ 0x9e3779b9)>>>0)() * (maxDelay-minDelay+1)).
create function public.engine_bot_intent(
  p_tier public.difficulty_tier, p_seed bigint,
  out will_be_correct boolean, out delay_ms int
)
language plpgsql immutable set search_path = '' as $$
declare
  mask constant bigint := 4294967295;
  delay_salt constant bigint := 2654435769;  -- 0x9e3779b9
  acc numeric; min_d int; max_d int; delay_seed bigint;
begin
  case p_tier
    when 'elite'  then acc := 0.8; min_d := 2000; max_d := 5000;
    when 'high'   then acc := 0.7; min_d := 2000; max_d := 6000;
    when 'medium' then acc := 0.6; min_d := 2000; max_d := 7000;
    else               acc := 0.5; min_d := 2000; max_d := 8000;  -- low
  end case;
  will_be_correct := public.engine_mulberry32(p_seed) < acc * 4294967296;
  delay_seed := (p_seed # delay_salt) & mask;
  delay_ms := min_d + public.engine_rand_int(delay_seed, max_d - min_d + 1);
end;
$$;
comment on function public.engine_bot_intent(public.difficulty_tier, bigint) is
  'Port SQL de lib/engine/bot.ts botIntent (§7.2). Verificado por paridad bit-perfect.';

-- ───────────────────────── precompute_bot_intents ─────────────────────────
create function public.precompute_bot_intents(p_penalty uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  mask constant bigint := 4294967295;
  wrong_salt constant bigint := 2246822507;  -- 0x85ebca6b
  v_match uuid; v_idx int; v_status public.penalty_status;
  v_started timestamptz; v_deadline timestamptz; v_question uuid;
  v_kicker uuid; v_keeper uuid; v_removed int; v_correct int;
  v_t_seed bigint; v_seed bigint; v_phase public.answer_phase;
  v_part uuid; v_is_bot boolean; v_tier public.difficulty_tier; v_seedp bigint;
  v_wc boolean; v_delay int; v_chosen int; v_sched timestamptz; v_wrong int[];
begin
  select match_id, idx, status, started_at, deadline, question_id,
         kicker_participant_id, keeper_participant_id, removed_option
    into v_match, v_idx, v_status, v_started, v_deadline, v_question,
         v_kicker, v_keeper, v_removed
    from public.penalties where id = p_penalty;
  if v_match is null or v_status not in ('open', 'second_chance') then return; end if;
  v_phase := case v_status when 'second_chance' then 'second_chance' else 'first' end;

  select t.seed into v_t_seed
    from public.matches m join public.tournaments t on t.id = m.tournament_id
    where m.id = v_match;
  v_seed := (coalesce(v_t_seed, 0) # public.engine_hash32(v_match::text || ':' || v_idx)) & mask;
  select correct_index into v_correct from public.questions where id = v_question;

  foreach v_part in array array[v_kicker, v_keeper] loop
    select p.is_bot, n.difficulty_tier into v_is_bot, v_tier
      from public.participants p
      left join public.nations n on n.id = p.nation_id
      where p.id = v_part;
    if not coalesce(v_is_bot, false) then continue; end if;
    v_tier := coalesce(v_tier, 'medium');  -- bot sin nación (dev harness) → tier medio

    -- Seed por (penal, participante, fase): reproducible y distinto en segunda chance.
    v_seedp := (v_seed # public.engine_hash32(v_part::text || ':' || v_phase::text)) & mask;
    select will_be_correct, delay_ms into v_wc, v_delay
      from public.engine_bot_intent(v_tier, v_seedp);

    if v_wc then
      v_chosen := v_correct;
    else
      -- Opción incorrecta (en segunda chance excluye la quitada → queda 1 sola).
      select array_agg(i order by i) into v_wrong from generate_series(0, 2) i
        where i <> v_correct and (v_removed is null or i <> v_removed);
      v_chosen := v_wrong[public.engine_rand_int((v_seedp # wrong_salt) & mask, array_length(v_wrong, 1)) + 1];
    end if;

    -- Responde a los delay_ms; nunca después del deadline de la ventana.
    v_sched := least(v_started + (v_delay::text || ' milliseconds')::interval, v_deadline);

    insert into public.bot_intents
        (penalty_id, participant_id, phase, scheduled_answer_at, will_be_correct, chosen_option, materialized)
      values (p_penalty, v_part, v_phase, v_sched, v_wc, v_chosen, false)
      on conflict (penalty_id, participant_id, phase) do nothing;
  end loop;
end;
$$;
revoke all on function public.precompute_bot_intents(uuid) from public, anon, authenticated;

-- ───────────────────────── materialize_bot_intents ─────────────────────────
-- Vuelca intents a penalty_answers. force=true → todos (al resolver); false → solo vencidos (tick).
create function public.materialize_bot_intents(p_penalty uuid, p_force boolean default false)
returns void language plpgsql security definer set search_path = '' as $$
declare v_status public.penalty_status; v_phase public.answer_phase;
begin
  select status into v_status from public.penalties where id = p_penalty;
  if v_status is null then return; end if;
  v_phase := case v_status when 'second_chance' then 'second_chance' else 'first' end;

  insert into public.penalty_answers
      (penalty_id, participant_id, option_index, selected_at, is_correct, is_random, phase)
  select bi.penalty_id, bi.participant_id, bi.chosen_option, bi.scheduled_answer_at,
         (bi.chosen_option = q.correct_index), false, bi.phase
  from public.bot_intents bi
  join public.penalties pe on pe.id = bi.penalty_id
  join public.questions q on q.id = pe.question_id
  where bi.penalty_id = p_penalty and bi.phase = v_phase and not bi.materialized
    and (p_force or bi.scheduled_answer_at <= now())
  on conflict (penalty_id, participant_id, phase) do nothing;

  update public.bot_intents
    set materialized = true
    where penalty_id = p_penalty and phase = v_phase and not materialized
      and (p_force or scheduled_answer_at <= now());
end;
$$;
revoke all on function public.materialize_bot_intents(uuid, boolean) from public, anon, authenticated;

-- ───────────────────────── open_penalty: precomputar intents al abrir ─────────────────────────
create or replace function public.open_penalty(p_penalty uuid)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  v_match uuid;
  v_idx int;
  v_difficulty public.difficulty;
  v_started timestamptz;
  v_deadline timestamptz;
  v_prompt text;
  v_options jsonb;
begin
  if uid is null then raise exception 'unauthenticated'; end if;

  select match_id into v_match from public.penalties where id = p_penalty;
  if v_match is null then raise exception 'penalty_not_found'; end if;
  if not public.is_match_member(v_match) then raise exception 'not_participant'; end if;

  update public.penalties
    set status = 'open', started_at = now(), deadline = now() + interval '10 seconds'
    where id = p_penalty and status = 'pending'
    returning idx, difficulty, started_at, deadline
    into v_idx, v_difficulty, v_started, v_deadline;

  if v_started is null then return; end if;

  select q.prompt, q.options into v_prompt, v_options
    from public.questions q
    join public.penalties pe on pe.question_id = q.id
    where pe.id = p_penalty;

  perform realtime.send(
    jsonb_build_object(
      'penalty_id', p_penalty,
      'match_id', v_match,
      'idx', v_idx,
      'prompt', v_prompt,
      'options', v_options,
      'difficulty', v_difficulty,
      'started_at', v_started,
      'deadline', v_deadline,
      'server_now', now()
    ),
    'penal:start',
    'match:' || v_match::text,
    true
  );

  -- 5.3: los bots ya tienen su intención (acierto/opción/momento) lista para este penal.
  perform public.precompute_bot_intents(p_penalty);
end;
$$;

-- ───────────────────────── resolve_penalty: bots por intent, humanos ausentes por random ─────────────────────────
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

  -- 5.3: bots → su respuesta del modelo (intent); recién después los ausentes humanos van a random.
  perform public.materialize_bot_intents(p_penalty, true);

  -- Ausentes (sin respuesta en esta fase) → opción aleatoria seeded (desconexión humana, §3.1/§5.2).
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

    -- 5.3: nuevas intenciones de los bots para la segunda chance (excluye la opción quitada).
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
end;
$$;

-- ───────────────────────── tick: + materializar bot_intents vencidos ─────────────────────────
create or replace function public.tick()
returns void
language plpgsql security definer set search_path = '' as $$
declare r record;
begin
  -- 5.3: intents de bots cuyo momento ya pasó y el penal sigue abierto → a penalty_answers.
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
    begin
      perform public.resolve_penalty(r.id);
    exception when others then
      null;
    end;
  end loop;
end;
$$;