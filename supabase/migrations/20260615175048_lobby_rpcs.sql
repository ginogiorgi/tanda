-- Tanda — F4 / tarea 4.1: matchmaking (create_room / join_room / quick_play) + RLS de
-- pertenencia para rooms / tournaments / participants.
--
-- Escrituras de juego SOLO por estos RPC SECURITY DEFINER (validan auth + estado + cupo).
-- Lecturas: un usuario ve su sala/torneo/co-participantes vía helpers SECURITY DEFINER que
-- evitan recursión de RLS. Ver SPEC §2.3, §5. start_tournament (bots/naciones/grupos) es F5.

-- ───────────────────────── helpers de pertenencia (para RLS) ─────────────────────────
create function public.is_tournament_member(p_tournament uuid)
returns boolean language sql security definer stable set search_path = '' as $$
  select exists (
    select 1 from public.participants
    where tournament_id = p_tournament and user_id = (select auth.uid())
  );
$$;

create function public.is_room_member(p_room uuid)
returns boolean language sql security definer stable set search_path = '' as $$
  select exists (
    select 1 from public.participants p
    join public.tournaments t on t.id = p.tournament_id
    where t.room_id = p_room and p.user_id = (select auth.uid())
  );
$$;

grant execute on function public.is_tournament_member(uuid) to authenticated;
grant execute on function public.is_room_member(uuid) to authenticated;

create policy "rooms_select_member" on public.rooms for select to authenticated
  using (host_id = (select auth.uid()) or public.is_room_member(id));

create policy "tournaments_select_member" on public.tournaments for select to authenticated
  using (public.is_tournament_member(id));

create policy "participants_select_member" on public.participants for select to authenticated
  using (public.is_tournament_member(tournament_id));

-- ───────────────────────── generador de código de sala ─────────────────────────
-- Alfabeto sin O/0/I/1 (legible). No se expone por RPC.
create function public.gen_room_code()
returns text language plpgsql set search_path = '' as $$
declare
  alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  code text;
  i int;
begin
  loop
    code := '';
    for i in 1..6 loop
      code := code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from public.rooms r where r.code = code);
  end loop;
  return code;
end;
$$;
revoke all on function public.gen_room_code() from public, anon, authenticated;

-- ───────────────────────── create_room ─────────────────────────
-- Crea sala (lobby, +2min), torneo (pending) y mete al caller como participante humano.
create function public.create_room()
returns table (room_id uuid, tournament_id uuid, code text)
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  v_room uuid;
  v_tournament uuid;
  v_code text;
begin
  if uid is null then raise exception 'unauthenticated'; end if;
  v_code := public.gen_room_code();
  insert into public.rooms (code, host_id, status, starts_at)
    values (v_code, uid, 'lobby', now() + interval '2 minutes')
    returning id into v_room;
  insert into public.tournaments (room_id, status, current_phase, seed)
    values (v_room, 'pending', 'groups', (random() * 9.2e18)::bigint)
    returning id into v_tournament;
  insert into public.participants (tournament_id, user_id, is_bot)
    values (v_tournament, uid, false);
  return query select v_room, v_tournament, v_code;
end;
$$;
grant execute on function public.create_room() to authenticated;

-- ───────────────────────── join_room ─────────────────────────
create function public.join_room(p_code text)
returns table (room_id uuid, tournament_id uuid, code text)
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  v_room uuid;
  v_tournament uuid;
  v_status public.room_status;
  v_count int;
begin
  if uid is null then raise exception 'unauthenticated'; end if;

  select r.id, t.id, r.status into v_room, v_tournament, v_status
    from public.rooms r
    join public.tournaments t on t.room_id = r.id
    where r.code = upper(trim(p_code));

  if v_room is null then raise exception 'room_not_found'; end if;
  if v_status = 'cancelled' then raise exception 'room_cancelled'; end if;
  if v_status <> 'lobby' then raise exception 'already_started'; end if;

  -- Ya está dentro → idempotente.
  if exists (
    select 1 from public.participants
    where tournament_id = v_tournament and user_id = uid
  ) then
    return query select v_room, v_tournament, upper(trim(p_code));
    return;
  end if;

  select count(*) into v_count from public.participants where tournament_id = v_tournament;
  if v_count >= 48 then raise exception 'room_full'; end if;

  insert into public.participants (tournament_id, user_id, is_bot)
    values (v_tournament, uid, false);
  -- (F5) si v_count + 1 = 48 → start_tournament(v_tournament) sin esperar los 2 min.

  return query select v_room, v_tournament, upper(trim(p_code));
end;
$$;
grant execute on function public.join_room(text) to authenticated;

-- ───────────────────────── quick_play ─────────────────────────
-- Reanuda el torneo activo del caller; si no, se une al lobby con más humanos y cupo; si no
-- hay, crea uno. Serializado con advisory lock para evitar carreras de matchmaking.
create function public.quick_play()
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

  -- 1) Torneo activo en curso → reanudar.
  select r.id, t.id, r.code into v_room, v_tournament, v_code
    from public.participants p
    join public.tournaments t on t.id = p.tournament_id
    join public.rooms r on r.id = t.room_id
    where p.user_id = uid and p.is_bot = false
      and r.status in ('lobby', 'starting', 'in_progress')
    order by r.created_at desc
    limit 1;
  if v_room is not null then
    return query select v_room, v_tournament, v_code;
    return;
  end if;

  -- 2) Lobby con más humanos y cupo.
  select r.id, t.id, r.code into v_room, v_tournament, v_code
    from public.rooms r
    join public.tournaments t on t.room_id = r.id
    where r.status = 'lobby'
      and (select count(*) from public.participants pp where pp.tournament_id = t.id) < 48
    order by
      (select count(*) from public.participants pp
        where pp.tournament_id = t.id and pp.is_bot = false) desc,
      r.created_at asc
    limit 1;
  if v_room is not null then
    insert into public.participants (tournament_id, user_id, is_bot)
      values (v_tournament, uid, false);
    return query select v_room, v_tournament, v_code;
    return;
  end if;

  -- 3) No hay → crear.
  return query select * from public.create_room();
end;
$$;
grant execute on function public.quick_play() to authenticated;
