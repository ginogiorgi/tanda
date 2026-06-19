-- Sesión 2026-06-19 (Fase B2.1 + Fase C) — cambios autoritativos de DB, consolidados en un solo
-- archivo de sesión (igual criterio que session_fixes). Todo idempotente (create-or-replace /
-- CREATE INDEX IF NOT EXISTS). Aplicado a prod por MCP. Contenido:
--   • B2.1  start_tournament deja BACKSTOP de presentación + RPC nuevo begin_presentation.
--   • C1/C2 índices questions(difficulty) y tournaments(round_deadline) WHERE in_progress.
--   • C4    tick() con techos por vuelta + raise warning (no traga errores).
--   • C3    quick_play sin lock global (FOR UPDATE SKIP LOCKED + lock acotado a la creación).

-- ════════════════════════════════════════════════════════════════════════════
-- B2.1 — Reloj de presentación relativo a la llegada del humano a /partido.
-- ════════════════════════════════════════════════════════════════════════════
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

-- ════════════════════════════════════════════════════════════════════════════
-- Fase C (C1/C2/C4) — índices + tick().
-- ════════════════════════════════════════════════════════════════════════════
-- el "switch" de escala = subir el tier de Supabase + pg_cron más frecuente, documentado en SPEC).
--
-- C1: índice de `questions(difficulty)` — hotspot de take_tournament_question (filtra por dificultad
--     recorriendo el banco en cada penal de cada match).
-- C2: índice parcial de `tournaments` activos — lo escanea tick() (round_deadline + advance) cada vuelta.
-- C4: tick() — subir los LIMIT (techo de penales/torneos procesados por vuelta) y reemplazar el
--     `exception when others then null` que tragaba errores por un `raise warning` (mismo aislamiento
--     por fila, pero ahora los fallos quedan en los logs de Postgres en vez de desaparecer).

-- ─────────────────────────────────────────────────────────────────────────────
-- C1 + C2 — índices.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS "questions_difficulty_idx"
  ON "public"."questions" USING "btree" ("difficulty");

CREATE INDEX IF NOT EXISTS "tournaments_in_progress_idx"
  ON "public"."tournaments" USING "btree" ("round_deadline")
  WHERE ("status" = 'in_progress'::"public"."tournament_status");

-- ─────────────────────────────────────────────────────────────────────────────
-- C4 — tick(): más techo por vuelta + logging de fallos (antes se tragaban en silencio).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION "public"."tick"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare r record;
begin
  insert into public.penalty_answers
      (penalty_id, participant_id, option_index, selected_at, is_correct, is_random, phase)
  select bi.penalty_id, bi.participant_id, bi.chosen_option, bi.scheduled_answer_at,
         (bi.chosen_option = q.correct_index), false, bi.phase
  from public.bot_intents bi
  join public.penalties pe on pe.id = bi.penalty_id and pe.status in ('open', 'second_chance')
  join public.questions q on q.id = pe.question_id
  where not bi.materialized and bi.scheduled_answer_at <= now()
  on conflict (penalty_id, participant_id, phase) do nothing;

  update public.bot_intents bi
    set materialized = true
    from public.penalties pe
    where bi.penalty_id = pe.id and pe.status in ('open', 'second_chance')
      and not bi.materialized and bi.scheduled_answer_at <= now();

  -- Techos por vuelta (C4): dimensionados para 1000+ concurrentes (~500 matches → ~500 penales
  -- venciendo juntos). Si se superan, la próxima vuelta de pg_cron limpia el resto. El "switch" de
  -- escala mayor = pg_cron más frecuente / subir estos números (ver SPEC §C).
  for r in
    select id from public.penalties
    where status in ('open', 'second_chance')
      and deadline is not null and deadline <= now()
    order by deadline
    limit 1000
  loop
    begin perform public.resolve_penalty(r.id);
    exception when others then raise warning 'tick resolve_penalty(%) failed: %', r.id, sqlerrm; end;
  end loop;

  -- Tiempo muerto entre rondas vencido → abrir la próxima ronda (backstop del poke del cliente).
  for r in
    select id from public.tournaments
    where status = 'in_progress' and round_deadline is not null and round_deadline <= now()
    limit 500
  loop
    begin perform public.open_next_round(r.id);
    exception when others then raise warning 'tick open_next_round(%) failed: %', r.id, sqlerrm; end;
  end loop;

  for r in
    select id from public.rooms where status = 'lobby' and starts_at <= now() limit 500
  loop
    begin perform public.start_tournament(r.id);
    exception when others then raise warning 'tick start_tournament(%) failed: %', r.id, sqlerrm; end;
  end loop;

  for r in
    select t.id from public.tournaments t
    where t.status = 'in_progress'
      and t.round_deadline is null
      and not exists (
        select 1 from public.matches m
        where m.tournament_id = t.id and m.status in ('in_progress', 'sudden_death')
      )
    limit 500
  loop
    begin perform public.advance_tournament(r.id);
    exception when others then raise warning 'tick advance_tournament(%) failed: %', r.id, sqlerrm; end;
  end loop;
end;
$$;

-- ════════════════════════════════════════════════════════════════════════════
-- C3 — quick_play sin lock global.
-- ════════════════════════════════════════════════════════════════════════════
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
