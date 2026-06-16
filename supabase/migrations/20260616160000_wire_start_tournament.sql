-- Tanda — F5 / wiring de start_tournament (cierra el pendiente de 4.7 + el TODO de join_room).
--
-- Disparadores de start_tournament (ambos in-DB):
--   1) join_room: al entrar el 48º humano, arranca YA (sin esperar los 2 min).
--   2) tick() (pg_cron cada 10s): lobbies con countdown vencido → start_tournament, que arranca
--      si hay ≥1 humano o cancela si no. Reemplaza el viejo "lobby vencido → cancelled" del
--      janitor (era stopgap pre-F5). El janitor queda solo para retención (borrar cancelled viejos).

-- ───────────────────────── join_room: arranque al llegar a 48 ─────────────────────────
-- Parte de la versión vigente (ventana de 2 min + columnas calificadas para evitar la
-- ambigüedad con el OUT param `tournament_id`) y suma el disparo del 48º.
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

  -- Ya está dentro → idempotente (un miembro puede recargar aunque cierre la ventana).
  if exists (
    select 1 from public.participants pj
    where pj.tournament_id = v_tournament and pj.user_id = uid
  ) then
    return query select v_room, v_tournament, upper(trim(p_code));
    return;
  end if;

  -- Solo se entra dentro de los 2 minutos.
  if v_starts_at <= now() then raise exception 'room_closed'; end if;

  select count(*) into v_count
    from public.participants pp where pp.tournament_id = v_tournament;
  if v_count >= 48 then raise exception 'room_full'; end if;

  insert into public.participants (tournament_id, user_id, is_bot)
    values (v_tournament, uid, false);

  -- Al completar 48, arranca ya (sin esperar el countdown).
  if v_count + 1 >= 48 then
    perform public.start_tournament(v_room);
  end if;

  return query select v_room, v_tournament, upper(trim(p_code));
end;
$$;

-- ───────────────────────── tick(): + arranque de lobbies vencidos ─────────────────────────
create or replace function public.tick()
returns void
language plpgsql security definer set search_path = '' as $$
declare r record;
begin
  -- (a) Penales abiertos vencidos (backstop si todos los clientes se cayeron).
  for r in
    select id from public.penalties
    where status in ('open', 'second_chance')
      and deadline is not null and deadline <= now()
    order by deadline
    limit 200
  loop
    begin
      perform public.resolve_penalty(r.id);
    exception when others then null;
    end;
  end loop;

  -- (b) Lobbies con countdown vencido → start_tournament (arranca si ≥1 humano, cancela si 0).
  for r in
    select id from public.rooms
    where status = 'lobby' and starts_at <= now()
    limit 100
  loop
    begin
      perform public.start_tournament(r.id);
    exception when others then null;
    end;
  end loop;
end;
$$;

-- ───────────────────────── janitor: solo retención ─────────────────────────
-- Ya no cancela lobbies vencidos (lo hace tick() vía start_tournament). Solo borra las salas
-- cancelled viejas (la cascada limpia tournaments/participants/matches/penalties).
create or replace function public.cleanup_stale_rooms()
returns void
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.rooms
    where status = 'cancelled' and created_at < now() - interval '1 day';
end;
$$;
