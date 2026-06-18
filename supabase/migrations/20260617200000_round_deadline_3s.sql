-- Tanda — F10 / 10.3: el tiempo muerto entre rondas pasa de 5s a 3s. Durante ese hueco el cliente
-- muestra la tabla del grupo actual (10.3) y, al vencer `round_deadline`, pokea `open_next_round`
-- para abrir la próxima ronda enseguida (el `tick()` sigue de backstop ≤10s). Solo cambia la duración
-- del tiempo muerto; el resto del barrier de ronda queda igual (create or replace fiel).
create or replace function public.resolve_round(p_tournament uuid)
returns void language plpgsql security definer set search_path = '' as $$
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
    -- quedan matches humanos vivos → tiempo muerto antes de la próxima ronda (posiciones en vivo)
    update public.tournaments set round_deadline = now() + interval '3 seconds' where id = p_tournament;
  else
    update public.tournaments set round_deadline = null where id = p_tournament;
    perform public.advance_tournament(p_tournament);
  end if;
end;
$$;
revoke all on function public.resolve_round(uuid) from public, anon, authenticated;
