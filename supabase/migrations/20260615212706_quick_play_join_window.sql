-- Tanda — F4 / fix 4.2: matchmaking respeta la ventana de 2 minutos.
--
-- Sin salas privadas: toda sala es pública y unible SOLO mientras dure su countdown
-- (starts_at > now()). "Jugar" (quick_play) hace matchmaking puro: te lleva a la sala
-- ABIERTA con más humanos en ese momento, o crea una. No reanuda lobbies vencidos (esos
-- quedan en limbo hasta start_tournament/tick() — F5/4.7); reanudar solo aplica a un torneo
-- realmente en curso (in_progress).

-- ───────────────────────── join_room (rechaza ventana cerrada) ─────────────────────────
create or replace function public.join_room(p_code text)
returns table (room_id uuid, tournament_id uuid, code text)
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  v_room uuid;
  v_tournament uuid;
  v_status public.room_status;
  v_starts_at timestamptz;
  v_count int;
begin
  if uid is null then raise exception 'unauthenticated'; end if;

  select r.id, t.id, r.status, r.starts_at
    into v_room, v_tournament, v_status, v_starts_at
    from public.rooms r
    join public.tournaments t on t.room_id = r.id
    where r.code = upper(trim(p_code));

  if v_room is null then raise exception 'room_not_found'; end if;
  if v_status = 'cancelled' then raise exception 'room_cancelled'; end if;
  if v_status <> 'lobby' then raise exception 'already_started'; end if;

  -- Ya está dentro → idempotente (un miembro puede recargar su sala aunque la ventana cierre).
  if exists (
    select 1 from public.participants pj
    where pj.tournament_id = v_tournament and pj.user_id = uid
  ) then
    return query select v_room, v_tournament, upper(trim(p_code));
    return;
  end if;

  -- Nuevo: solo se entra dentro de los 2 minutos.
  if v_starts_at <= now() then raise exception 'room_closed'; end if;

  select count(*) into v_count from public.participants where tournament_id = v_tournament;
  if v_count >= 48 then raise exception 'room_full'; end if;

  insert into public.participants (tournament_id, user_id, is_bot)
    values (v_tournament, uid, false);
  -- (F5) si v_count + 1 = 48 → start_tournament(v_tournament) sin esperar los 2 min.

  return query select v_room, v_tournament, upper(trim(p_code));
end;
$$;
grant execute on function public.join_room(text) to authenticated;

-- ───────────────────────── quick_play (matchmaking puro) ─────────────────────────
create or replace function public.quick_play()
returns table (room_id uuid, tournament_id uuid, code text)
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  v_room uuid;
  v_tournament uuid;
  v_code text;
begin
  if uid is null then raise exception 'unauthenticated'; end if;
  perform pg_advisory_xact_lock(hashtext('tanda_quick_play'));

  -- 1) Reanudar: torneo en curso, o un lobby propio AÚN ABIERTO (no uno vencido).
  select r.id, t.id, r.code into v_room, v_tournament, v_code
    from public.participants p
    join public.tournaments t on t.id = p.tournament_id
    join public.rooms r on r.id = t.room_id
    where p.user_id = uid and p.is_bot = false
      and (r.status = 'in_progress'
           or (r.status = 'lobby' and r.starts_at > now()))
    order by r.created_at desc
    limit 1;
  if v_room is not null then
    return query select v_room, v_tournament, v_code;
    return;
  end if;

  -- 2) Lobby ABIERTO (dentro de los 2 min) con más humanos y cupo.
  select r.id, t.id, r.code into v_room, v_tournament, v_code
    from public.rooms r
    join public.tournaments t on t.room_id = r.id
    where r.status = 'lobby'
      and r.starts_at > now()
      and (select count(*) from public.participants pp where pp.tournament_id = t.id) < 48
    order by
      (select count(*) from public.participants pp
        where pp.tournament_id = t.id and pp.is_bot = false) desc,
      r.created_at asc
    limit 1;
  if v_room is not null then
    -- idempotente: no duplicar si ya soy parte de esa sala.
    if not exists (
      select 1 from public.participants pq
      where pq.tournament_id = v_tournament and pq.user_id = uid
    ) then
      insert into public.participants (tournament_id, user_id, is_bot)
        values (v_tournament, uid, false);
    end if;
    return query select v_room, v_tournament, v_code;
    return;
  end if;

  -- 3) No hay ninguna abierta → crear.
  return query select * from public.create_room();
end;
$$;
grant execute on function public.quick_play() to authenticated;
