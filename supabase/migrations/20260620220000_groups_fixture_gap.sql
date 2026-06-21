-- ════════════════════════════════════════════════════════════════════════════
-- T10 — El fixture de grupos entre tandas dura 1 s más (6s → 7s).
--
-- En `resolve_round`, el gap ENTRE matches (no dentro del mismo) es la ventana en que se ve la tabla
-- del grupo antes del próximo partido. Subirlo de 6s a 7s da un toque más de aire para leerla.
-- Intra-partido sigue 3s (= animación). Único cambio vs. groups_timing (F3). Idempotente.
-- ════════════════════════════════════════════════════════════════════════════
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
    -- ENTRE matches → animación del último penal + ~4s para ver la tabla/grupo (10.3). T10: 6s → 7s.
    update public.tournaments set round_deadline = now() + interval '7 seconds'
      where id = p_tournament and status = 'in_progress';
  end if;

  perform public.notify_round_next(p_tournament);
end;
$$;
