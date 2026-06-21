-- Tanda — pausa de "grupos finales" ~4s antes del KO (T11 del plan de 16).
--
-- Problema: `build_knockout` cierra los grupos Y flipea `current_phase='round_of_32'` de forma
-- atómica, y el cliente decide "mostrar grupos vs bracket" SOLO por `current_phase`. Por eso el
-- lead-in de 2s previo se veía sobre el árbol KO, no sobre los grupos.
--
-- Solución (enfoque B, decidido por Gino): estado intermedio "grupos cerrados pero bracket no
-- revelado". Una columna nueva `tournaments.groups_closed_at` marca el inicio de la ventana; durante
-- 4s `current_phase` SIGUE 'groups' (el cliente muestra las tablas finales) y recién al vencer se
-- arma el bracket + lead-in de 2s para el reveal del árbol.
--
-- También arregla el clobber de `round_deadline` en `open_next_round`: seteaba el deadline a null
-- incondicionalmente al final, pisando el lead-in que `advance_tournament` acababa de fijar en la
-- misma transacción (la pausa colapsaba a ~1s vía `tick()`). Ahora solo limpia el deadline ya
-- vencido. Beneficio extra: los lead-ins ahora "pegan" → el poke de `round:next` abre el KO a
-- tiempo en vez de depender del `tick()`.

-- ── 0. Estado intermedio ──────────────────────────────────────────────────────────────────────
alter table public.tournaments add column if not exists groups_closed_at timestamptz;
comment on column public.tournaments.groups_closed_at is
  'T11: inicio de la ventana de "grupos finales" antes del KO. Mientras está seteada y current_phase=groups, se muestran las tablas finales ~4s antes de armar el bracket.';

-- ── 1. advance_tournament: partir el cierre de grupos en (pausa 4s) → (armar bracket) ──────────
CREATE OR REPLACE FUNCTION "public"."advance_tournament"("p_tournament" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_phase public.tournament_phase; v_pending int; v_total int; v_unfinished int;
  v_phase_after public.tournament_phase; v_groups_closed_at timestamptz;
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
        -- Grupos completos. Enfoque B (T11): NO armar el bracket todavía.
        select groups_closed_at into v_groups_closed_at from public.tournaments
          where id = p_tournament;
        if v_groups_closed_at is null then
          -- 1ª llegada: ventana de 4s sobre los grupos finales (current_phase sigue 'groups').
          update public.tournaments
            set groups_closed_at = now(), round_deadline = now() + interval '4 seconds'
            where id = p_tournament and status = 'in_progress';
          perform public.notify_round_next(p_tournament);
          return;
        else
          -- Ventana cumplida: armar el bracket + lead-in de 2s para el reveal del árbol (tareas 16/17).
          perform public.build_knockout(p_tournament);
          update public.tournaments set round_deadline = now() + interval '2 seconds'
            where id = p_tournament and status = 'in_progress';
          perform public.notify_round_next(p_tournament);
          return;
        end if;
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

-- ── 2. open_next_round: no pisar un lead-in recién fijado (solo limpiar el deadline vencido) ────
CREATE OR REPLACE FUNCTION "public"."open_next_round"("p_tournament" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare uid uuid := (select auth.uid()); v_rd timestamptz;
begin
  if uid is not null and not public.is_tournament_member(p_tournament) then
    raise exception 'not_participant';
  end if;

  perform pg_advisory_xact_lock(public.engine_hash32('tanda_round:' || p_tournament::text));

  select round_deadline into v_rd from public.tournaments
    where id = p_tournament and status = 'in_progress';
  if v_rd is null then return; end if;       -- no hay tiempo muerto en curso
  if now() < v_rd then return; end if;       -- el tiempo muerto no terminó

  if exists (
    select 1 from public.penalties pe join public.matches m on m.id = pe.match_id
    where m.tournament_id = p_tournament and not m.is_bot_only
      and pe.status in ('open', 'second_chance')
  ) then
    return;  -- defensivo: ya hay ronda abierta
  end if;

  -- Si quedan matches humanos en curso → abrir su próximo penal (dentro de la jornada). Si no,
  -- saltear (la frontera de jornada la cruza advance_tournament, que SÍ simula los bot-only nuevos).
  if exists (
    select 1 from public.matches m
    where m.tournament_id = p_tournament and not m.is_bot_only
      and m.status in ('in_progress', 'sudden_death')
  ) then
    perform public.open_round_penals(p_tournament);
  end if;

  -- Si no quedó ningún penal humano abierto (cruce de jornada/fase o todos terminaron) → avanzar.
  if not exists (
    select 1 from public.penalties pe join public.matches m on m.id = pe.match_id
    where m.tournament_id = p_tournament and not m.is_bot_only
      and pe.status in ('open', 'second_chance')
  ) then
    perform public.advance_tournament(p_tournament);
  end if;

  -- Limpiar SOLO el deadline ya vencido. `advance_tournament` pudo fijar un lead-in futuro (4s de
  -- la pausa de grupos o 2s del reveal del bracket) en esta misma transacción; el early-return de
  -- arriba garantiza que el deadline que nos habilitó está vencido (<= now()), así que esto nunca
  -- pisa un lead-in legítimo, y la pausa de T11 "pega".
  update public.tournaments set round_deadline = null
    where id = p_tournament and status = 'in_progress' and round_deadline <= now();
end;
$$;
