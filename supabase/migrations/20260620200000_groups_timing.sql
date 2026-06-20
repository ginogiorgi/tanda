-- ════════════════════════════════════════════════════════════════════════════
-- F3 — Timing de la fase de grupos (medido en prod, no adivinado).
--
-- Bug 1 (presentación eterna): el room arrancaba y el 1er penal abría 30s después = el BACKSTOP de
--   start_tournament. begin_presentation (que debía comprimirlo a 4s desde la llegada del humano) NO
--   surte efecto en prod (RPC del cliente frágil, igual que los pokes). Fix robusto: el backstop ES
--   la ventana de presentación → 30s → 6s (≈1s para llegar a /partido + 2s país + 3s grupos). El cron
--   de 1s abre el 1er penal al vencer. Ya no depende de begin_presentation (queda no-op: 6s < 8s).
--
-- Bug 2 (grupo no se ve entre jornadas): el server ya dejaba ~5s de gap, pero el cliente lo detectaba
--   ~1.5s tarde (poll) y el linger de 3s se comía el resto → bracket visible ~0.5s. Server: subir el
--   gap entre partidos 5s → 6s (combinado con linger 2s + poll 1s en el cliente → ~3s de grupo).
-- ════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- start_tournament: backstop de presentación 30s → 6s (es la ventana real; no dependemos del
-- begin_presentation del cliente). Resto idéntico al port de session_b2_c_optim.
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

  -- VENTANA DE PRESENTACIÓN (F3): 6s = ~1s para que el humano llegue a /partido + 2s país + 3s grupos.
  -- El cron de 1s abre el 1er penal al vencer. No abrimos la jornada acá → el 1er penal arranca con
  -- 10s plenos. (Antes 30s, comprimido por begin_presentation del cliente, que no surtía efecto.)
  update public.tournaments set round_deadline = now() + interval '6 seconds'
    where id = v_tournament;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- resolve_round: gap entre partidos 5s → 6s (más aire para que el cliente muestre el grupo ~3s).
-- Intra-partido sigue 3s (animación). Port del de session_f_timing.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION "public"."resolve_round"("p_tournament" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER SET "search_path" TO ''
    AS $$
begin
  if exists (
    select 1 from public.penalties pe join public.matches m on m.id = pe.match_id
    where m.tournament_id = p_tournament and not m.is_bot_only
      and pe.status in ('open', 'second_chance')
  ) then
    return;  -- ronda en juego: faltan penales (o 2ª chances) por cerrar
  end if;

  if exists (
    select 1 from public.matches m
    where m.tournament_id = p_tournament and not m.is_bot_only
      and m.status in ('in_progress', 'sudden_death')
  ) then
    -- DENTRO del match: próximo penal del mismo match (10.2) → tiempo muerto = animación (3s).
    update public.tournaments set round_deadline = now() + interval '3 seconds'
      where id = p_tournament and status = 'in_progress';
  else
    -- ENTRE matches → animación del último penal + ~3s para ver la tabla/grupo (10.3).
    update public.tournaments set round_deadline = now() + interval '6 seconds'
      where id = p_tournament and status = 'in_progress';
  end if;

  perform public.notify_round_next(p_tournament);
end;
$$;
