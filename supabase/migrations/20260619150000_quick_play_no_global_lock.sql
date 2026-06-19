-- C3 (2026-06-19) — quick_play sin lock global (escalabilidad de matchmaking, SENSIBLE).
--
-- Antes: `pg_advisory_xact_lock(hashtext('tanda_quick_play'))` serializaba TODAS las llamadas a
-- quick_play del sistema → cuello de botella bajo carga (1000+ concurrentes).
--
-- Ahora:
--  • Camino común (hay lobby abierto) = SIN lock global. La sala elegida se toma con
--    `FOR UPDATE ... SKIP LOCKED`: dos quick_play concurrentes agarran salas distintas o saltan a
--    crear, y el cupo se re-chequea BAJO el lock de fila → nunca se pasa de 48 (lo que antes evitaba
--    el lock global).
--  • Camino raro (no hay lobby) = se serializa SOLO la creación con un lock acotado y se vuelve a
--    buscar (alguien pudo crear recién) → evita la fragmentación en un burst inicial sin penalizar el
--    camino común.
-- Semántica idéntica para el usuario; ports/regla intactos. Verificado contra concurrency.test.ts.
CREATE OR REPLACE FUNCTION "public"."quick_play"() RETURNS TABLE("room_id" "uuid", "tournament_id" "uuid", "code" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  uid uuid := (select auth.uid());
  v_room uuid;
  v_tournament uuid;
  v_code text;
begin
  if uid is null then raise exception 'unauthenticated'; end if;
  perform public.enforce_rate_limit('quick_play', 20, interval '1 minute');

  -- 1) Reanudar: torneo en curso, o un lobby propio AÚN ABIERTO (no uno vencido). Sin lock.
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

  -- 2) Lobby ABIERTO con más humanos y cupo, tomado con FOR UPDATE SKIP LOCKED (sin lock global).
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
    limit 1
    for update of r skip locked;
  if v_room is not null then
    -- idempotente + re-chequeo de cupo BAJO el lock de fila → carrera no pasa de 48.
    if not exists (
      select 1 from public.participants pq
      where pq.tournament_id = v_tournament and pq.user_id = uid
    ) and (select count(*) from public.participants pp where pp.tournament_id = v_tournament) < 48
    then
      insert into public.participants (tournament_id, user_id, is_bot)
        values (v_tournament, uid, false);
    end if;
    return query select v_room, v_tournament, v_code;
    return;
  end if;

  -- 3) No hay lobby abierto → serializar SOLO la creación con un lock acotado y volver a buscar (otro
  --    pudo crear bajo el lock) para no fragmentar en un burst. Mucho menos contención que el lock
  --    global previo (solo se toma cuando no hay sala que reusar).
  perform pg_advisory_xact_lock(hashtext('tanda_quick_play_create'));

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
    if not exists (
      select 1 from public.participants pq
      where pq.tournament_id = v_tournament and pq.user_id = uid
    ) and (select count(*) from public.participants pp where pp.tournament_id = v_tournament) < 48
    then
      insert into public.participants (tournament_id, user_id, is_bot)
        values (v_tournament, uid, false);
    end if;
    return query select v_room, v_tournament, v_code;
    return;
  end if;

  -- Sigue sin haber → crear.
  return query select * from public.create_room();
end;
$$;
