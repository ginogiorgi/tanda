-- ════════════════════════════════════════════════════════════════════════════
-- Sesión F — Timing agresivo (matar el tiempo muerto entre penales).
--
-- Los 10s de respuesta y los ~3s de animación del penal NO se tocan (son contenido). Lo que se
-- ataca es todo lo que hoy SE SUMA encima y las pantallas de transición que duran de más:
--   • Entre partidos: round_deadline 6s → 5s (3s animación del último penal + 2s de grupo).
--   • Lead-in de fase (KO): 6s → 2s (ver los cruces nuevos).
--   • Presentación inicial: 6s → 4s (2s país + 2s grupos).
--   • Nuevo evento broadcast `round:next` (open_at) → el cliente pokea open_next_round EXACTO al
--     vencer el round_deadline en vez de esperar el poll de 1500ms (menos polling, más broadcast).
--
-- El round_deadline intra-partido se mantiene en 3s (es la ventana de animación, máx 3s).
-- ════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- notify_round_next: avisa por el canal del torneo cuándo se abre la próxima ronda (open_at =
-- round_deadline) para que el cliente agende un poke PRECISO a open_next_round. Mismo patrón de
-- realtime.send que emit_score_live (canal `tournament:{id}`). No-op si no hay tiempo muerto en
-- curso. Interno (lo llaman funciones SECURITY DEFINER): sin grant a authenticated.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION "public"."notify_round_next"("p_tournament" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare v_rd timestamptz;
begin
  select round_deadline into v_rd from public.tournaments
    where id = p_tournament and status = 'in_progress';
  if v_rd is null then return; end if;

  perform realtime.send(
    jsonb_build_object('open_at', v_rd, 'server_now', now()),
    'round:next', 'tournament:' || p_tournament::text, true
  );
end;
$$;

ALTER FUNCTION "public"."notify_round_next"("p_tournament" "uuid") OWNER TO "postgres";
REVOKE ALL ON FUNCTION "public"."notify_round_next"("p_tournament" "uuid") FROM PUBLIC;

-- ─────────────────────────────────────────────────────────────────────────────
-- resolve_round (barrier de ronda): tiempo muerto entre partidos 6s → 5s. El intra-partido sigue
-- en 3s (animación del penal). Avisa el open_at por broadcast al setear el deadline.
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
    -- ENTRE matches → 3s de animación del último penal + 2s para ver la tabla/grupo (10.3).
    update public.tournaments set round_deadline = now() + interval '5 seconds'
      where id = p_tournament and status = 'in_progress';
  end if;

  perform public.notify_round_next(p_tournament);
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- advance_tournament: lead-in de fase 6s → 2s (ver los cruces nuevos). Avisa el open_at por
-- broadcast tras setear cada deadline. Port de session_fixes con esos dos cambios.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION "public"."advance_tournament"("p_tournament" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_phase public.tournament_phase; v_pending int; v_total int; v_unfinished int;
  v_phase_after public.tournament_phase;
begin
  loop
    select current_phase into v_phase from public.tournaments
      where id = p_tournament and status = 'in_progress';
    if v_phase is null then return; end if;

    if v_phase = 'groups' then
      if exists (select 1 from public.matches
                 where tournament_id = p_tournament and phase = 'group'
                   and status in ('in_progress', 'sudden_death')) then
        return;  -- jornada en curso
      end if;
      if exists (select 1 from public.matches
                 where tournament_id = p_tournament and phase = 'group' and status = 'pending') then
        perform public.open_round(p_tournament);  -- abre la próxima jornada
        continue;
      else
        perform public.build_knockout(p_tournament);  -- grupos completos → arma el bracket
        -- Lead-in: ventana para ver el bracket de eliminación antes del 1er penal de KO (tareas 16/17).
        update public.tournaments set round_deadline = now() + interval '2 seconds'
          where id = p_tournament and status = 'in_progress';
        perform public.notify_round_next(p_tournament);
        return;
      end if;
    end if;

    -- Fases de eliminación (la 'final' incluye el 3er puesto).
    if exists (select 1 from public.matches m
               where m.tournament_id = p_tournament and m.status in ('in_progress', 'sudden_death')
                 and (m.phase::text = v_phase::text or (v_phase = 'final' and m.phase = 'third_place'))) then
      return;  -- partido en curso
    end if;

    select count(*) filter (where status = 'pending'),
           count(*),
           count(*) filter (where status <> 'finished')
      into v_pending, v_total, v_unfinished
      from public.matches m
      where m.tournament_id = p_tournament
        and (m.phase::text = v_phase::text or (v_phase = 'final' and m.phase = 'third_place'));

    if v_total = 0 then
      return;  -- defensivo: la fase aún no tiene matches
    elsif v_pending > 0 then
      perform public.open_round(p_tournament);  -- abre los pendientes (bot-only al instante)
      continue;
    elsif v_unfinished = 0 then
      perform public.advance_ko_round(p_tournament);  -- ronda completa → siguiente / corona
      select current_phase into v_phase_after from public.tournaments
        where id = p_tournament and status = 'in_progress';
      -- ¿Se armó una fase nueva (no la final ya coronada)? → lead-in para ver el bracket/rival.
      if v_phase_after is not null and v_phase_after is distinct from v_phase then
        update public.tournaments set round_deadline = now() + interval '2 seconds'
          where id = p_tournament and status = 'in_progress';
        perform public.notify_round_next(p_tournament);
        return;
      end if;
      continue;
    else
      return;
    end if;
  end loop;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- begin_presentation: ventana de presentación 6s → 4s (2s país + 2s grupos). El guard de
-- idempotencia (> now()+8s) sigue valiendo (el backstop de start_tournament es 30s). Avisa el
-- open_at por broadcast (best-effort: si el canal aún no está suscrito, el poll del cliente cubre).
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
    set round_deadline = now() + interval '4 seconds'
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
