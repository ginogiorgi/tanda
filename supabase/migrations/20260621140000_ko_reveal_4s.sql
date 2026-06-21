-- T7 — Tras la última tanda de grupos, mostrar los cruces de eliminatorias ~4s (como el primer
-- reveal de grupos) antes de arrancar los 16avos. Antes el lead-in del reveal del árbol era 2s,
-- muy corto para ver cómo quedaron los cruces. Solo se toca esa transición (grupos→KO); los
-- lead-ins entre rondas KO siguen en 2s. Port fiel de groups_ko_pause con ese único cambio.
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
          -- Ventana cumplida: armar el bracket + lead-in de 4s para ver los cruces (T7).
          perform public.build_knockout(p_tournament);
          update public.tournaments set round_deadline = now() + interval '4 seconds'
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
