-- Tanda — F4 / tarea 4.8: `get_active_match` — rehidratación tras refresh/reconexión (SPEC
-- §5, §5.2). Devuelve el torneo/partido en curso del caller y, si hay un penal abierto, su
-- pregunta+opciones (NUNCA `correct_index`) + deadline + mi selección actual (para restaurar el
-- resaltado). `null` si el caller no tiene partido activo.
--
-- Desconexión ≠ abandono: al volver, el cliente llama esto y retoma el control del penal en
-- curso con su `deadline` server; mientras estuvo ausente, resolve_penalty le asignó aleatorias.
create function public.get_active_match()
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

  -- Partido en curso del caller dentro de un torneo en curso.
  select m.id as match_id, m.tournament_id, m.phase, m.home_score, m.away_score
    into v_match
    from public.matches m
    join public.tournaments t on t.id = m.tournament_id
    join public.participants p on p.id in (m.home_participant_id, m.away_participant_id)
    where p.user_id = uid
      and t.status = 'in_progress'
      and m.status in ('in_progress', 'sudden_death')
    order by m.created_at desc
    limit 1;
  if v_match.match_id is null then return null; end if;

  -- Penal abierto del match (si hay uno en juego ahora mismo).
  select pe.id, pe.idx, pe.status, pe.started_at, pe.deadline, pe.removed_option,
         q.prompt, q.options
    into v_pen
    from public.penalties pe
    join public.questions q on q.id = pe.question_id
    where pe.match_id = v_match.match_id and pe.status in ('open', 'second_chance')
    order by pe.idx desc
    limit 1;

  -- Mi selección en ese penal (para restaurar el resaltado al reconectar).
  if v_pen.id is not null then
    v_phase := case v_pen.status when 'open' then 'first' else 'second_chance' end;
    select pa.option_index into v_my_option
      from public.penalty_answers pa
      join public.participants p on p.id = pa.participant_id
      where pa.penalty_id = v_pen.id and p.user_id = uid and pa.phase = v_phase;
  end if;

  return jsonb_build_object(
    'tournament_id', v_match.tournament_id,
    'match_id', v_match.match_id,
    'phase', v_match.phase,
    'home_score', v_match.home_score,
    'away_score', v_match.away_score,
    'penal', case when v_pen.id is null then null else jsonb_build_object(
      'penalty_id', v_pen.id,
      'match_id', v_match.match_id,
      'idx', v_pen.idx,
      'prompt', v_pen.prompt,
      'options', v_pen.options,
      'started_at', v_pen.started_at,
      'deadline', v_pen.deadline,
      'server_now', now(),
      'removed_option', v_pen.removed_option,
      'phase', v_phase,
      'my_option', v_my_option
    ) end
  );
end;
$$;
grant execute on function public.get_active_match() to authenticated;
