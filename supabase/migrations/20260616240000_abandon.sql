-- Tanda — F5 / tarea 5.4: botón Abandonar (`abandon`).
--
-- El humano que abandona deja de jugar y su participante pasa a BOT con la dificultad de su nación
-- (§7.2): de ahí en más sus penales los juega el bot (no respuesta aleatoria — eso es desconexión,
-- §3.1). Los penales en curso de sus matches se completan con el intent del bot. El usuario vuelve
-- al home: `get_active_match` deja de rehidratarlo (se filtra is_bot). No hay auto-abandono.

-- ───────────────────────── abandon (humano → bot) ─────────────────────────
-- Entrada por match (el cliente del partido ya tiene matchId). Resuelve el torneo desde el match,
-- marca al participante del caller como bot y precomputa los intents del bot en sus penales abiertos
-- (si ya había respondido un penal, su respuesta queda; el bot toma desde el próximo).
create function public.abandon(p_match uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  v_tournament uuid; v_part uuid; r record;
begin
  if uid is null then raise exception 'unauthenticated'; end if;

  select tournament_id into v_tournament from public.matches where id = p_match;
  if v_tournament is null then raise exception 'match_not_found'; end if;

  select id into v_part from public.participants
    where tournament_id = v_tournament and user_id = uid and is_bot = false;
  if v_part is null then raise exception 'not_participant'; end if;

  update public.participants set is_bot = true where id = v_part;

  -- Penales en curso donde patea/ataja → ahora los juega el bot (precompute si no respondió).
  for r in
    select pe.id from public.penalties pe
    join public.matches m on m.id = pe.match_id
    where m.tournament_id = v_tournament
      and pe.status in ('open', 'second_chance')
      and (pe.kicker_participant_id = v_part or pe.keeper_participant_id = v_part)
  loop
    perform public.precompute_bot_intents(r.id);
  end loop;
end;
$$;

-- ───────────────────────── get_active_match: no rehidratar al que abandonó ─────────────────────────
-- Igual que 4.8, pero el participante debe seguir siendo humano (is_bot = false): si abandonó, su
-- participante es bot y el usuario no debe volver al partido (se queda en el home).
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
         q.prompt, q.options
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
      'my_option', v_my_option
    ) end
  );
end;
$$;
