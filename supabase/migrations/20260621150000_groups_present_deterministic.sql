-- ════════════════════════════════════════════════════════════════════════════
-- Timing de presentación — enfoque DETERMINÍSTICO (re-anclado a la llegada del humano).
--
-- Problema: la ventana de presentación se fijaba en start_tournament a now()+6s desde el ARRANQUE
-- del torneo. La latencia real de navegación al /partido (~4s) + el reveal de país (2s) se comían
-- el presupuesto → la tabla de grupos se veía <1s.
--
-- Fix: volver a usar begin_presentation (lo llama el cliente al MONTAR /partido) para fijar la
-- ventana desde la LLEGADA del humano, no desde el arranque del torneo. Ahora es confiable porque
-- el cron tick() de 1s abre el primer penal al vencer round_deadline (ya no depende del poke frágil
-- del cliente). start_tournament deja un backstop generoso (15s) como red de seguridad: solo se usa
-- si begin_presentation fallara.
--
-- Presupuesto desde la llegada: 6s = 2s país (REVEAL_MS) + ~4s grupos. El cron abre el 1er penal a
-- ~+6s → grupos visible ~4-5s, independiente de la latencia de navegación.
-- ════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- start_tournament: backstop de presentación 6s → 15s (red de seguridad). El timing real lo fija
-- begin_presentation al llegar el humano. Resto idéntico al port de groups_timing.
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

  -- BACKSTOP de presentación: 15s. La ventana REAL la fija begin_presentation al llegar el humano a
  -- /partido (now()+6s desde la llegada). Esto solo actúa de red de seguridad si begin_presentation
  -- fallara. El cron de 1s abre el 1er penal al vencer round_deadline.
  update public.tournaments set round_deadline = now() + interval '15 seconds'
    where id = v_tournament;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- begin_presentation: ventana de presentación 4s → 6s (2s país + ~4s grupos), re-anclada a la
-- llegada del humano. Guard idempotente (> now()+8s): tras el primer humano round_deadline queda en
-- ~6s < 8s → las llamadas siguientes y de otros humanos son no-op. Con backstop 15s el guard matchea
-- para latencias de navegación realistas. El cron de 1s abre el 1er penal al vencer.
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

  perform public.notify_round_next(p_tournament);
end;
$$;
