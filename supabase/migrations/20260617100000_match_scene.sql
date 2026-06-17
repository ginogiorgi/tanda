-- Tanda — F8 / tarea 8.2: datos de escena para la pantalla de partido 3D.
--
-- La escena de penal (cancha + arco + pelota + avatares pateador/arquero) necesita, además del
-- penal en curso, datos estáticos del partido que hoy NO viajan a ningún lado: las naciones/kits
-- de ambos lados y los avatares de los jugadores. Y para colocar a cada avatar (pateador vs
-- arquero) hace falta saber quién patea/ataja en el penal actual (autoritativo, de la fila
-- `penalties`, NO re-derivado en el cliente).
--
-- Esta migración:
--   (1) suma `kicker_participant_id`/`keeper_participant_id` al payload de `penal:start`
--       (open_penalty_internal) y al sub-objeto `penal` de get_active_match (rehidratación).
--       La 2ª chance NO cambia de pateador/arquero (mismo penalty_id) → el cliente arrastra los
--       roles al cambiar de fase, así que no hace falta tocar resolve_penalty.
--   (2) agrega get_match_scene(match): briefs de nación (reusa participant_brief) + avatares
--       (profiles.avatar; bot/sin user → null → DEFAULT_AVATAR en el cliente) + my_participant_id.
--
-- Nada sensible: participant ids + naciones + avatares (ya visibles en bracket/HUD). El anti-trampa
-- se mantiene: `correct_index` nunca viaja (ni acá ni en penal:start).

-- ───────────────────────── open_penalty_internal: + kicker/keeper en penal:start ─────────────────────────
create or replace function public.open_penalty_internal(p_penalty uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_match uuid; v_idx int; v_difficulty public.difficulty;
  v_started timestamptz; v_deadline timestamptz; v_prompt text; v_options jsonb;
  v_kicker uuid; v_keeper uuid;
begin
  update public.penalties
    set status = 'open', started_at = now(), deadline = now() + interval '10 seconds'
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
$$;
revoke all on function public.open_penalty_internal(uuid) from public, anon, authenticated;

-- ───────────────────────── get_active_match: + kicker/keeper en el penal ─────────────────────────
-- Igual que la versión de abandon (5.4: filtra is_bot=false), + kicker_participant_id/
-- keeper_participant_id en el sub-objeto `penal` para colocar los avatares al rehidratar.
create or replace function public.get_active_match()
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  v_match record;
  v_pen record;
  v_my_option int;
  v_phase public.answer_phase;
begin
  if uid is null then raise exception 'unauthenticated'; end if;

  select m.id as match_id, m.tournament_id, m.phase, m.home_score, m.away_score
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

  select pe.id, pe.idx, pe.status, pe.started_at, pe.deadline, pe.removed_option,
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
      'removed_option', v_pen.removed_option,
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

-- ───────────────────────── get_match_scene (datos estáticos de la escena 3D) ─────────────────────────
-- Briefs de nación (reusa participant_brief) + avatares de ambos jugadores + cuál participante es
-- el caller. Solo para miembros del match. Estático por partido (no cambia penal a penal); el
-- cliente lo pide una vez al montar la pantalla. Bot/sin user_id → avatar null (el cliente cae a
-- DEFAULT_AVATAR). NO devuelve nada sensible.
create function public.get_match_scene(p_match uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  v_home uuid; v_away uuid; v_my uuid;
begin
  if uid is null then raise exception 'unauthenticated'; end if;
  if not public.is_match_member(p_match) then raise exception 'not_match_member'; end if;

  select home_participant_id, away_participant_id into v_home, v_away
    from public.matches where id = p_match;
  if v_home is null then raise exception 'match_not_found'; end if;

  select id into v_my from public.participants
    where id in (v_home, v_away) and user_id = uid limit 1;

  return jsonb_build_object(
    'match_id', p_match,
    'my_participant_id', v_my,
    'home', public.participant_brief(v_home),
    'away', public.participant_brief(v_away),
    'home_avatar', (select pr.avatar from public.profiles pr
                    join public.participants pa on pa.user_id = pr.id where pa.id = v_home),
    'away_avatar', (select pr.avatar from public.profiles pr
                    join public.participants pa on pa.user_id = pr.id where pa.id = v_away)
  );
end;
$$;
grant execute on function public.get_match_scene(uuid) to authenticated;
