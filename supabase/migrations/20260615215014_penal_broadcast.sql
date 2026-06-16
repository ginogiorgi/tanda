-- Tanda — F4 / tarea 4.3: Broadcast `penal:start` (sin la correcta) + autorización del canal
-- privado `match:{id}`.
--
-- Patrón de toda la capa realtime (decisión): los eventos de juego se emiten desde la DB con
-- realtime.send() dentro de la misma RPC SECURITY DEFINER que cambia el estado. El cliente se
-- suscribe a un canal privado; una policy SELECT en realtime.messages deja que SOLO los
-- participantes del match reciban. `correct_index` NUNCA entra al payload (§7 SPEC).

-- ───────────────────────── pertenencia a un match ─────────────────────────
create function public.is_match_member(p_match uuid)
returns boolean language sql security definer stable set search_path = '' as $$
  select exists (
    select 1
    from public.matches m
    join public.participants p on p.id in (m.home_participant_id, m.away_participant_id)
    where m.id = p_match and p.user_id = (select auth.uid())
  );
$$;
grant execute on function public.is_match_member(uuid) to authenticated;

-- Versión por topic (`match:{uuid}`) para la policy de realtime.messages. Parseo defensivo:
-- cualquier topic que no sea un match válido → false (no rompe otros canales).
create function public.realtime_match_member(p_topic text)
returns boolean language plpgsql security definer stable set search_path = '' as $$
declare v_match uuid;
begin
  if p_topic is null or p_topic not like 'match:%' then return false; end if;
  begin
    v_match := substring(p_topic from 7)::uuid;
  exception when others then
    return false;
  end;
  return public.is_match_member(v_match);
end;
$$;
grant execute on function public.realtime_match_member(text) to authenticated;

-- Autorización de lectura de Broadcasts privados de `match:{id}`: solo participantes.
create policy "match_broadcast_select" on realtime.messages
  for select to authenticated
  using (
    extension = 'broadcast'
    and public.realtime_match_member((select realtime.topic()))
  );

-- ───────────────────────── open_penalty ─────────────────────────
-- Abre un penal pending: fija started_at/deadline (server) y emite `penal:start` SIN la
-- correcta. Idempotente por lock optimista (status pending→open); reabrir es no-op.
create function public.open_penalty(p_penalty uuid)
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

  -- Lock optimista: solo abre si está pending. Si no, ya estaba abierto/resuelto → no-op.
  update public.penalties
    set status = 'open', started_at = now(), deadline = now() + interval '10 seconds'
    where id = p_penalty and status = 'pending'
    returning idx, difficulty, started_at, deadline
    into v_idx, v_difficulty, v_started, v_deadline;

  if v_started is null then return; end if;

  -- Pregunta SIN correct_index (la policy de questions es deny-all; acá entra por SECURITY DEFINER).
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
end;
$$;
grant execute on function public.open_penalty(uuid) to authenticated;

-- ───────────────────────── harness DEV (temporal, se reemplaza en F5/F8) ─────────────────────────
-- Crea un penal de práctica para el caller: pregunta stub + room cancelada (invisible al
-- matchmaking y barrida por el janitor) + torneo + 2 participantes (caller + bot) + match +
-- penal pending. Devuelve match_id/penalty_id para suscribirse y abrirlo. NO es parte del
-- flujo real: en F5 los penales los crea start_tournament/fixture.
create function public.dev_create_practice_penal()
returns table (match_id uuid, penalty_id uuid)
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  v_room uuid; v_tournament uuid; v_me uuid; v_bot uuid; v_match uuid; v_pen uuid; v_q uuid;
begin
  if uid is null then raise exception 'unauthenticated'; end if;

  select id into v_q from public.questions where category = 'dev' limit 1;
  if v_q is null then
    insert into public.questions (category, difficulty, prompt, options, correct_index, explanation)
      values ('dev', 'easy', '¿Quién salió campeón del Mundial 2022?',
              '["Argentina", "Francia", "Brasil"]'::jsonb, 0, 'Argentina, en Qatar.')
      returning id into v_q;
  end if;

  insert into public.rooms (code, host_id, status, starts_at)
    values (public.gen_room_code(), uid, 'cancelled', now())
    returning id into v_room;
  insert into public.tournaments (room_id, status, current_phase, seed)
    values (v_room, 'in_progress', 'groups', 0)
    returning id into v_tournament;
  insert into public.participants (tournament_id, user_id, is_bot)
    values (v_tournament, uid, false) returning id into v_me;
  insert into public.participants (tournament_id, user_id, is_bot)
    values (v_tournament, null, true) returning id into v_bot;
  insert into public.matches (tournament_id, phase, status, home_participant_id, away_participant_id)
    values (v_tournament, 'group', 'in_progress', v_me, v_bot) returning id into v_match;
  insert into public.penalties
      (match_id, idx, kicker_participant_id, keeper_participant_id, question_id, difficulty, status)
    values (v_match, 1, v_me, v_bot, v_q, 'easy', 'pending') returning id into v_pen;

  return query select v_match, v_pen;
end;
$$;
grant execute on function public.dev_create_practice_penal() to authenticated;
