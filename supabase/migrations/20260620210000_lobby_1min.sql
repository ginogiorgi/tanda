-- ════════════════════════════════════════════════════════════════════════════
-- T8 — Sala de espera 2 min → 1 min.
--
-- La cuenta regresiva del lobby es el `starts_at` que fija create_room (quick_play lo reusa). Bajar la
-- espera a 1 minuto hace que las partidas arranquen más rápido. Único cambio vs. el baseline:
-- `interval '2 minutes'` → `interval '1 minute'`. El cliente solo dibuja el `starts_at`, no cambia.
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION "public"."create_room"() RETURNS TABLE("room_id" "uuid", "tournament_id" "uuid", "code" "text")
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
  perform public.enforce_rate_limit('create_room', 10, interval '1 minute');
  v_code := public.gen_room_code();
  insert into public.rooms (code, host_id, status, starts_at)
    values (v_code, uid, 'lobby', now() + interval '1 minute')
    returning id into v_room;
  insert into public.tournaments (room_id, status, current_phase, seed)
    values (v_room, 'pending', 'groups', (random() * 9.2e18)::bigint)
    returning id into v_tournament;
  insert into public.participants (tournament_id, user_id, is_bot)
    values (v_tournament, uid, false);
  return query select v_room, v_tournament, v_code;
end;
$$;
