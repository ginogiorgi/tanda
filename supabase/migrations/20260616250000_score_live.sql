-- Tanda — F6 / tarea 6.5: marcadores en vivo en el bracket (`score:live`).
--
-- Mismo patrón que la capa realtime de penal (4.3) pero a nivel TORNEO: un canal privado
-- `tournament:{id}` (policy en realtime.messages → solo participantes del torneo) por el que se
-- emite `score:live` cada vez que un partido aparece (fixture al abrir la ronda), cambia el
-- marcador (penal a penal) o termina (incl. bot-only al instante). La pantalla de bracket (F8 8.5)
-- y las posiciones en vivo (4.6) se actualizan sin polling. No viaja nada sensible (solo marcador
-- + naciones), así que el payload es completo para renderizar.

-- ───────────────────────── pertenencia + canal `tournament:{id}` ─────────────────────────
-- Versión por topic de is_tournament_member (ya existe), para la policy de realtime.messages.
create function public.realtime_tournament_member(p_topic text)
returns boolean language plpgsql security definer stable set search_path = '' as $$
declare v_t uuid;
begin
  if p_topic is null or p_topic not like 'tournament:%' then return false; end if;
  begin
    v_t := substring(p_topic from 12)::uuid;
  exception when others then
    return false;
  end;
  return public.is_tournament_member(v_t);
end;
$$;
grant execute on function public.realtime_tournament_member(text) to authenticated;

create policy "tournament_broadcast_select" on realtime.messages
  for select to authenticated
  using (
    extension = 'broadcast'
    and public.realtime_tournament_member((select realtime.topic()))
  );

-- ───────────────────────── participant_brief (para render de bracket/marcadores) ─────────────────────────
-- jsonb compacto de un participante con su nación (código/nombre/bandera/kit) para que el cliente
-- pinte el cruce sin fetch extra. null si el id es null o no existe.
create function public.participant_brief(p_part uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'participant_id', p.id,
    'user_id', p.user_id,
    'is_bot', p.is_bot,
    'nation_id', p.nation_id,
    'nation_code', n.code,
    'nation_name', n.name,
    'flag', n.flag_asset,
    'kit_primary', n.kit_primary,
    'accent', n.accent_color
  )
  from public.participants p
  left join public.nations n on n.id = p.nation_id
  where p.id = p_part;
$$;
revoke all on function public.participant_brief(uuid) from public, anon, authenticated;

-- ───────────────────────── emit_score_live (broadcast del estado de un partido) ─────────────────────────
create function public.emit_score_live(p_match uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v record;
begin
  select m.tournament_id as tid, m.id as mid, m.phase, m.group_letter, m.bracket_slot, m.status,
         m.home_score, m.away_score, m.winner_participant_id,
         m.home_participant_id as home, m.away_participant_id as away
    into v from public.matches m where m.id = p_match;
  if v.tid is null then return; end if;

  perform realtime.send(
    jsonb_build_object(
      'match_id', v.mid, 'phase', v.phase, 'group_letter', v.group_letter,
      'bracket_slot', v.bracket_slot, 'status', v.status,
      'home_score', v.home_score, 'away_score', v.away_score,
      'winner_participant_id', v.winner_participant_id,
      'home', public.participant_brief(v.home),
      'away', public.participant_brief(v.away),
      'server_now', now()
    ),
    'score:live', 'tournament:' || v.tid::text, true
  );
end;
$$;
revoke all on function public.emit_score_live(uuid) from public, anon, authenticated;

-- ───────────────────────── open_round: emitir el fixture al abrir la ronda ─────────────────────────
-- (igual que play_round, + emit_score_live para los matches con humanos al abrirlos; los bot-only
-- emiten su marcador final desde simulate_bot_match.)
create or replace function public.open_round(p_tournament uuid)
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
      if r.is_bot_only then
        perform public.simulate_bot_match(r.id);
      else
        perform public.progress_match(r.id);
        perform public.emit_score_live(r.id);
      end if;
    end loop;
  else
    for r in
      select id, is_bot_only from public.matches
      where tournament_id = p_tournament and status = 'pending'
        and (phase::text = v_phase::text or (v_phase = 'final' and phase = 'third_place'))
    loop
      if r.is_bot_only then
        perform public.simulate_bot_match(r.id);
      else
        perform public.progress_match(r.id);
        perform public.emit_score_live(r.id);
      end if;
    end loop;
  end if;
end;
$$;
revoke all on function public.open_round(uuid) from public, anon, authenticated;

-- ───────────────────────── simulate_bot_match: emitir marcador final ─────────────────────────
create or replace function public.simulate_bot_match(p_match uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  mask constant bigint := 4294967295;
  v_status public.match_status; v_phase public.match_phase; v_bot_only boolean;
  v_home uuid; v_away uuid; v_t_seed bigint; v_kind text;
  v_home_tier public.difficulty_tier; v_away_tier public.difficulty_tier;
  v_scored boolean[] := '{}'; st record; i int;
  v_kicker uuid; v_keeper uuid; k_tier public.difficulty_tier; g_tier public.difficulty_tier;
  v_seedp bigint; sc boolean;
begin
  select m.status, m.phase, m.is_bot_only, m.home_participant_id, m.away_participant_id, t.seed
    into v_status, v_phase, v_bot_only, v_home, v_away, v_t_seed
    from public.matches m join public.tournaments t on t.id = m.tournament_id
    where m.id = p_match;
  if v_home is null then raise exception 'match_not_found'; end if;
  if not v_bot_only then raise exception 'not_bot_only'; end if;
  if v_status = 'finished' then return; end if;            -- idempotente
  if v_home is null or v_away is null then raise exception 'match_incomplete'; end if;

  v_kind := case when v_phase = 'group' then 'group' else 'elimination' end;
  select coalesce(difficulty_tier, 'medium') into v_home_tier
    from public.participants p left join public.nations n on n.id = p.nation_id where p.id = v_home;
  select coalesce(difficulty_tier, 'medium') into v_away_tier
    from public.participants p left join public.nations n on n.id = p.nation_id where p.id = v_away;

  loop
    select * into st from public.engine_advance_match(v_kind, v_scored);
    exit when st.status = 'finished';
    i := st.next_index;
    if st.next_kicker = 'home' then
      v_kicker := v_home; v_keeper := v_away; k_tier := v_home_tier; g_tier := v_away_tier;
    else
      v_kicker := v_away; v_keeper := v_home; k_tier := v_away_tier; g_tier := v_home_tier;
    end if;
    v_seedp := (coalesce(v_t_seed, 0) # public.engine_hash32(p_match::text || ':' || i)) & mask;
    sc := public.bot_penalty_scored(v_seedp, k_tier, g_tier, v_kicker, v_keeper);
    v_scored := array_append(v_scored, sc);
    exit when array_length(v_scored, 1) > 60;  -- tope de seguridad (muerte súbita interminable)
  end loop;

  update public.matches
    set home_score = st.home, away_score = st.away, status = 'finished',
        winner_participant_id = case st.winner
          when 'home' then v_home when 'away' then v_away else null end
    where id = p_match;

  perform public.emit_score_live(p_match);  -- 6.5: marcador final del partido bot-only
end;
$$;
revoke all on function public.simulate_bot_match(uuid) from public, anon, authenticated;

-- ───────────────────────── resolve_penalty: emitir marcador tras cada resolución ─────────────────────────
-- (igual que play_round, + emit_score_live tras progress_match: el bracket ve el marcador penal a
-- penal y el cierre del partido.)
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

  -- Encadenar el match (abrir el siguiente penal o cerrarlo), emitir marcador y avanzar el torneo.
  perform public.progress_match(v_match);
  perform public.emit_score_live(v_match);   -- 6.5: marcador penal a penal + cierre del partido
  perform public.advance_tournament(v_tournament);
end;
$$;
