-- Tanda — F4 / tarea 4.4: `select_option` — respuesta del humano, cambiable, con timestamp
-- del servidor y validaciones de ventana/pertenencia (SPEC §5, §7).
--
-- Registra/actualiza la ÚLTIMA selección del caller en (penalty, participant, phase) con
-- `selected_at = now()` server. NO resuelve el penal (eso es a los 10s, tarea 4.5). La
-- corrección (`is_correct`) se calcula server-side leyendo `questions.correct_index` (que
-- nunca viaja al cliente) y se guarda en `penalty_answers` (tabla sin SELECT del cliente).

create function public.select_option(p_penalty uuid, p_option int)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  v_match uuid;
  v_status public.penalty_status;
  v_started timestamptz;
  v_deadline timestamptz;
  v_removed int;
  v_participant uuid;
  v_phase public.answer_phase;
  v_correct int;
  v_is_correct boolean;
begin
  if uid is null then raise exception 'unauthenticated'; end if;

  select match_id, status, started_at, deadline, removed_option
    into v_match, v_status, v_started, v_deadline, v_removed
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

  -- Opción válida (0-2) y, en segunda chance, distinta de la quitada.
  if p_option < 0 or p_option > 2 then raise exception 'invalid_option'; end if;
  if v_phase = 'second_chance' and p_option = v_removed then
    raise exception 'invalid_option';
  end if;

  -- Corrección server-only: la pregunta entra acá por SECURITY DEFINER (policy deny-all).
  select q.correct_index into v_correct
    from public.questions q
    join public.penalties pe on pe.question_id = q.id
    where pe.id = p_penalty;
  v_is_correct := (p_option = v_correct);

  -- Última selección gana: upsert por (penalty, participant, phase). `is_random=false` porque
  -- la elige un humano presente (las aleatorias de ausentes las pone resolve_penalty, 4.5).
  insert into public.penalty_answers
      (penalty_id, participant_id, option_index, selected_at, is_correct, is_random, phase)
    values (p_penalty, v_participant, p_option, now(), v_is_correct, false, v_phase)
  on conflict (penalty_id, participant_id, phase)
  do update set option_index = excluded.option_index,
                selected_at  = excluded.selected_at,
                is_correct   = excluded.is_correct,
                is_random    = false;
end;
$$;
grant execute on function public.select_option(uuid, int) to authenticated;
