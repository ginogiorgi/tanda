-- B2.1 (2026-06-19) — Reloj de presentación relativo a la llegada del humano a /partido.
--
-- Problema: `start_tournament` seteaba `round_deadline = now()+6s` en el server, desacoplado de
-- cuándo el jugador realmente entra a /partido. Esos 6s corrían mientras el lobby aún mostraba
-- "Armando torneo…", así que el jugador se perdía los primeros segundos de la presentación.
--
-- Fix: `start_tournament` deja un BACKSTOP largo (now()+30s) en vez de la ventana real. El RPC nuevo
-- `begin_presentation` —que el cliente llama al montar TournamentLive— comprime esa ventana a 6s en
-- la PRIMERA llamada de un humano. Así la presentación arranca cuando el humano entra, no antes. Si
-- ningún humano llega, el backstop de 30s + `tick()` abren la jornada igual (no se cuelga el torneo).
-- Server-authoritative: solo timing de presentación, ninguna evaluación acá. (SPEC §4.6/§6.4.)

-- ─────────────────────────────────────────────────────────────────────────────
-- start_tournament: dejar BACKSTOP (30s) en vez de la ventana de presentación (6s).
-- (Idéntico a session_fixes salvo el seteo final de round_deadline.)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION "public"."start_tournament"("p_room" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_letters constant text[] := array['A','B','C','D','E','F','G','H','I','J','K','L'];
  v_tournament uuid;
  v_seed bigint;
  v_humans int;
begin
  select t.id, t.seed into v_tournament, v_seed
    from public.tournaments t
    where t.room_id = p_room and t.status = 'pending'
    for update skip locked;
  if v_tournament is null then return; end if;

  select count(*) into v_humans
    from public.participants where tournament_id = v_tournament and is_bot = false;

  if v_humans = 0 then
    update public.rooms set status = 'cancelled' where id = p_room;
    return;
  end if;

  update public.rooms set status = 'starting' where id = p_room;

  with h as (
    select id, row_number() over (order by created_at, id) as rn
    from public.participants
    where tournament_id = v_tournament and is_bot = false
  )
  update public.participants p
    set group_letter = v_letters[((h.rn - 1) % 12) + 1]
    from h where p.id = h.id;

  insert into public.participants (tournament_id, user_id, is_bot, group_letter)
  select v_tournament, null, true, g.letter
  from (select unnest(v_letters) as letter) g
  cross join lateral generate_series(
    1,
    4 - (select count(*) from public.participants
         where tournament_id = v_tournament and group_letter = g.letter)
  );

  with parts as (
    select id, row_number() over (order by md5(v_seed::text || ':' || id::text)) as rn
    from public.participants where tournament_id = v_tournament
  ),
  nats as (
    select id as nation_id, row_number() over (order by md5(v_seed::text || ':' || id::text)) as rn
    from public.nations
  )
  update public.participants p
    set nation_id = nats.nation_id
    from parts join nats on nats.rn = parts.rn
    where p.id = parts.id;

  with ps as (
    select id, group_letter, is_bot,
           row_number() over (
             partition by group_letter order by md5(v_seed::text || ':' || id::text)
           ) as rn
    from public.participants where tournament_id = v_tournament
  )
  insert into public.matches
    (tournament_id, phase, group_letter, bracket_slot,
     home_participant_id, away_participant_id, is_bot_only, status)
  select v_tournament, 'group', h.group_letter, pair.md,
         h.id, a.id, (h.is_bot and a.is_bot), 'pending'
  from (values (1,4,1),(2,3,1),(1,3,2),(4,2,2),(1,2,3),(3,4,3)) as pair(hr, ar, md)
  join ps h on h.rn = pair.hr
  join ps a on a.rn = pair.ar and a.group_letter = h.group_letter;

  update public.tournaments set status = 'in_progress', current_phase = 'groups'
    where id = v_tournament;
  update public.rooms set status = 'in_progress' where id = p_room;

  -- BACKSTOP de presentación (B2.1): la ventana REAL la fija begin_presentation cuando el humano entra
  -- a /partido. Esto solo evita que un torneo sin humano presente se cuelgue: a los 30s tick() abre
  -- la jornada igual. No abrimos la jornada acá → el 1er penal arranca con 10s plenos.
  update public.tournaments set round_deadline = now() + interval '30 seconds'
    where id = v_tournament;
end;
$$;


-- ─────────────────────────────────────────────────────────────────────────────
-- begin_presentation: la 1ª llamada de un humano comprime el backstop a la ventana real (6s).
-- Idempotente: las llamadas siguientes (otros humanos, remounts) ven <8s restantes y son no-op, así
-- las llegadas tardías no extienden la presentación. Solo aplica a la presentación INICIAL (fase de
-- grupos, ningún penal abierto aún). No evalúa nada: puro timing.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION "public"."begin_presentation"("p_tournament" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare uid uuid := (select auth.uid());
begin
  if uid is null then raise exception 'unauthenticated'; end if;
  if not public.is_tournament_member(p_tournament) then raise exception 'not_participant'; end if;

  perform pg_advisory_xact_lock(public.engine_hash32('tanda_round:' || p_tournament::text));

  update public.tournaments
    set round_deadline = now() + interval '6 seconds'
    where id = p_tournament and status = 'in_progress' and current_phase = 'groups'
      and round_deadline is not null and round_deadline > now() + interval '8 seconds'
      and not exists (
        select 1 from public.penalties pe
        join public.matches m on m.id = pe.match_id
        where m.tournament_id = p_tournament
      );
end;
$$;

ALTER FUNCTION "public"."begin_presentation"("p_tournament" "uuid") OWNER TO "postgres";
REVOKE ALL ON FUNCTION "public"."begin_presentation"("p_tournament" "uuid") FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."begin_presentation"("p_tournament" "uuid") FROM "anon";
GRANT ALL ON FUNCTION "public"."begin_presentation"("p_tournament" "uuid") TO "authenticated";
