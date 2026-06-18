-- Sesión de fixes (2026-06-18). Cambios autoritativos de DB para:
--   A1 (tarea 3):  ventana de presentación (ver grupos/bracket) antes de abrir el 1er penal de cada
--                  ronda nueva → el penal arranca con los 10s completos. Reusa `round_deadline`.
--   A2 (tarea 5):  RPC `get_penalty_result` para rehidratar un resultado de penal perdido (broadcast
--                  perdido por reconexión) sin quedar colgado en la animación.
--   A3 (tarea 10): segunda chance → a CADA jugador se le quita la opción que ÉL eligió (por participante).
--   A4 (tarea 7):  `get_tournament_history` devuelve datos del partido final (rival, score, desenlace).
-- Ports fieles del motor TS (lib/engine/penalty.ts). Sin tocar el baseline: create-or-replace encima.

-- ─────────────────────────────────────────────────────────────────────────────
-- A3 — esquema: opción quitada por participante en la segunda chance.
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.penalties
  add column if not exists removed_option_kicker integer,
  add column if not exists removed_option_keeper integer;


-- ─────────────────────────────────────────────────────────────────────────────
-- A1 — open_next_round: NO pisar un `round_deadline` recién seteado por advance_tournament.
-- (advance_tournament puede armar la próxima fase y dejar una ventana de presentación nueva; el
--  clear de acá solo debe borrar la ventana que estábamos cerrando, no la nueva.)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION "public"."open_next_round"("p_tournament" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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

  -- Si quedan matches humanos en curso → abrir su próximo penal (dentro de la jornada). Si no,
  -- saltear (la frontera de jornada la cruza advance_tournament, que SÍ simula los bot-only nuevos).
  if exists (
    select 1 from public.matches m
    where m.tournament_id = p_tournament and not m.is_bot_only
      and m.status in ('in_progress', 'sudden_death')
  ) then
    perform public.open_round_penals(p_tournament);
  end if;

  -- Si no quedó ningún penal humano abierto (cruce de jornada/fase o todos terminaron) → avanzar.
  if not exists (
    select 1 from public.penalties pe join public.matches m on m.id = pe.match_id
    where m.tournament_id = p_tournament and not m.is_bot_only
      and pe.status in ('open', 'second_chance')
  ) then
    perform public.advance_tournament(p_tournament);
  end if;

  -- Cerrar SOLO la ventana que veníamos cerrando. Si advance_tournament dejó una nueva (lead-in de
  -- la próxima fase), tiene otro timestamp y se preserva.
  update public.tournaments set round_deadline = null
    where id = p_tournament and round_deadline = v_rd;
end;
$$;


-- ─────────────────────────────────────────────────────────────────────────────
-- A1 — advance_tournament: tras armar una FASE nueva (grupos→KO o KO→KO), dejar una ventana de
-- presentación (round_deadline) antes de abrir su 1er penal, en vez de abrirlo de una. Así el
-- jugador ve el bracket/quién juega (tareas 16/17) y el penal arranca con los 10s completos (tarea 3).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION "public"."advance_tournament"("p_tournament" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_phase public.tournament_phase; v_pending int; v_total int; v_unfinished int;
  v_phase_after public.tournament_phase;
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
        perform public.build_knockout(p_tournament);  -- grupos completos → arma el bracket
        -- Lead-in: ventana para ver el bracket de eliminación antes del 1er penal de KO (tareas 16/17).
        update public.tournaments set round_deadline = now() + interval '6 seconds'
          where id = p_tournament and status = 'in_progress';
        return;
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
        update public.tournaments set round_deadline = now() + interval '6 seconds'
          where id = p_tournament and status = 'in_progress';
        return;
      end if;
      continue;
    else
      return;
    end if;
  end loop;
end;
$$;


-- ─────────────────────────────────────────────────────────────────────────────
-- A1 — start_tournament: en vez de abrir la 1ª jornada de una, dejar la ventana de presentación
-- (ver los grupos) y que el reloj de ronda abra el 1er penal con los 10s completos (tarea 3).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION "public"."start_tournament"("p_room" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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

  -- 6.4(b) + tarea 3: ventana de presentación de los grupos antes de abrir el 1er penal. No abrimos la
  -- jornada acá; open_next_round/tick la abren al vencer el deadline → el penal arranca con 10s plenos.
  update public.tournaments set round_deadline = now() + interval '6 seconds'
    where id = v_tournament;
end;
$$;


-- ─────────────────────────────────────────────────────────────────────────────
-- A3 — resolve_penalty: en "los dos mal" (1ª fase), quitar a CADA jugador la opción que eligió.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION "public"."resolve_penalty"("p_penalty" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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
      'correct_index', v_correct, 'explanation', v_explanation,
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


-- ─────────────────────────────────────────────────────────────────────────────
-- A3 — select_option: validar contra la opción quitada DEL QUE LLAMA (kicker/keeper).
-- ─────────────────────────────────────────────────────────────────────────────
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
end;
$$;


-- ─────────────────────────────────────────────────────────────────────────────
-- A3 — get_active_match: devolver la opción quitada DEL QUE LLAMA (rehidratación de 2ª chance).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION "public"."get_active_match"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  uid uuid := (select auth.uid());
  v_match record;
  v_pen record;
  v_my_option int;
  v_my_removed int;
  v_phase public.answer_phase;
begin
  if uid is null then raise exception 'unauthenticated'; end if;

  select m.id as match_id, m.tournament_id, m.phase, m.home_score, m.away_score, p.id as my_part
    into v_match
    from public.matches m
    join public.tournaments t on t.id = m.tournament_id
    join public.participants p on p.id in (m.home_participant_id, m.away_participant_id)
    where p.user_id = uid
      and p.is_bot = false
      and t.status = 'in_progress'
      and m.status in ('in_progress', 'sudden_death')
    order by m.created_at desc
    limit 1;
  if v_match.match_id is null then return null; end if;

  select pe.id, pe.idx, pe.status, pe.started_at, pe.deadline,
         pe.removed_option_kicker, pe.removed_option_keeper,
         pe.kicker_participant_id, pe.keeper_participant_id, q.prompt, q.options
    into v_pen
    from public.penalties pe
    join public.questions q on q.id = pe.question_id
    where pe.match_id = v_match.match_id and pe.status in ('open', 'second_chance')
    order by pe.idx desc
    limit 1;

  if v_pen.id is not null then
    v_phase := case v_pen.status when 'open' then 'first' else 'second_chance' end;
    select pa.option_index into v_my_option
      from public.penalty_answers pa
      join public.participants p on p.id = pa.participant_id
      where pa.penalty_id = v_pen.id and p.user_id = uid and pa.phase = v_phase;
    v_my_removed := case
      when v_pen.kicker_participant_id = v_match.my_part then v_pen.removed_option_kicker
      when v_pen.keeper_participant_id = v_match.my_part then v_pen.removed_option_keeper end;
  end if;

  return jsonb_build_object(
    'match_id', v_match.match_id,
    'tournament_id', v_match.tournament_id,
    'phase', v_match.phase,
    'home_score', v_match.home_score,
    'away_score', v_match.away_score,
    'penal', case when v_pen.id is null then null else jsonb_build_object(
      'penalty_id', v_pen.id,
      'match_id', v_match.match_id,
      'idx', v_pen.idx,
      'prompt', v_pen.prompt,
      'options', v_pen.options,
      'removed_option', v_my_removed,
      'phase', v_phase,
      'started_at', v_pen.started_at,
      'deadline', v_pen.deadline,
      'server_now', now(),
      'my_option', v_my_option,
      'kicker_participant_id', v_pen.kicker_participant_id,
      'keeper_participant_id', v_pen.keeper_participant_id
    ) end
  );
end;
$$;


-- ─────────────────────────────────────────────────────────────────────────────
-- A2 — get_penalty_result: rehidratar un resultado de penal YA resuelto (broadcast perdido).
-- Solo penales `resolved` (correct_index seguro) y solo para miembros del match.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION "public"."get_penalty_result"("p_penalty" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  uid uuid := (select auth.uid());
  v_match uuid; v_idx int; v_res jsonb; v_question uuid;
  v_correct int; v_explanation text; v_home_score int; v_away_score int;
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

  select q.correct_index, q.explanation into v_correct, v_explanation
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
    'correct_index', v_correct, 'explanation', v_explanation,
    'home_score', v_home_score, 'away_score', v_away_score,
    'won_by_speed', coalesce((v_res->>'won_by_speed')::boolean, false),
    'kicker_participant_id', v_kicker, 'keeper_participant_id', v_keeper,
    'kicker_selected_at', v_k_sel, 'keeper_selected_at', v_g_sel
  );
end;
$$;

ALTER FUNCTION "public"."get_penalty_result"("p_penalty" "uuid") OWNER TO "postgres";
REVOKE ALL ON FUNCTION "public"."get_penalty_result"("p_penalty" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_penalty_result"("p_penalty" "uuid") TO "authenticated";


-- ─────────────────────────────────────────────────────────────────────────────
-- A4 — get_tournament_history: agregar datos del partido final (rival, score, desenlace) por torneo.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION "public"."get_tournament_history"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  uid uuid := (select auth.uid());
  v_result jsonb;
begin
  if uid is null then return '[]'::jsonb; end if;

  select coalesce(jsonb_agg(entry order by played_at desc), '[]'::jsonb)
    into v_result
  from (
    select
      jsonb_build_object(
        'tournamentId', p.tournament_id,
        'nationName', coalesce(n.name, '—'),
        'nationCode', n.code,
        'kitPrimary', n.kit_primary,
        'placement', p.placement,
        'eliminatedPhase', p.eliminated_phase,
        'abandoned', p.abandoned,
        'goalsFor', coalesce(agg.goals_for, 0),
        'matchesPlayed', coalesce(agg.played, 0),
        'matchesWon', coalesce(agg.won, 0),
        'playedAt', t.created_at,
        -- Partido más avanzado y terminado del jugador (para la tarjeta tipo resultado, tarea 7).
        'finalPhase', lm.phase,
        'finalMyScore', lm.my_score,
        'finalOppScore', lm.opp_score,
        'finalOppNationCode', opn.code,
        'finalOppKitPrimary', opn.kit_primary,
        'outcome', case
          when p.abandoned then 'abandoned'
          when lm.match_id is null then null
          when lm.winner_participant_id = p.id then 'won'
          else 'lost' end
      ) as entry,
      t.created_at as played_at
    from public.participants p
      join public.tournaments t on t.id = p.tournament_id
      left join public.nations n on n.id = p.nation_id
      left join lateral (
        select
          count(*) as played,
          count(*) filter (where m.winner_participant_id = p.id) as won,
          coalesce(sum(
            case when m.home_participant_id = p.id then m.home_score else m.away_score end
          ), 0) as goals_for
        from public.matches m
        where m.status = 'finished'
          and (m.home_participant_id = p.id or m.away_participant_id = p.id)
      ) agg on true
      left join lateral (
        select
          m.match_id_v as match_id, m.phase, m.winner_participant_id,
          case when m.home_participant_id = p.id then m.home_score else m.away_score end as my_score,
          case when m.home_participant_id = p.id then m.away_score else m.home_score end as opp_score,
          case when m.home_participant_id = p.id then m.away_participant_id
               else m.home_participant_id end as opp_id
        from (
          select mm.id as match_id_v, mm.phase, mm.winner_participant_id,
                 mm.home_participant_id, mm.away_participant_id, mm.home_score, mm.away_score
          from public.matches mm
          where mm.status = 'finished'
            and (mm.home_participant_id = p.id or mm.away_participant_id = p.id)
          order by case mm.phase::text
            when 'group' then 0 when 'round_of_32' then 1 when 'round_of_16' then 2
            when 'quarters' then 3 when 'semis' then 4 when 'third_place' then 5
            when 'final' then 6 else -1 end desc,
            mm.created_at desc
          limit 1
        ) m
      ) lm on true
      left join public.participants opp on opp.id = lm.opp_id
      left join public.nations opn on opn.id = opp.nation_id
    where p.user_id = uid   -- los bots puros tienen user_id null → solo trae participaciones humanas
  ) sub;

  return v_result;
end;
$$;
