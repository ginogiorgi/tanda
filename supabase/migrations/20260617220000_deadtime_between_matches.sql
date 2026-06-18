-- Tanda — F10 / 10.3 (fix): tiempo muerto REAL entre partidos.
--
-- Bug: en una partida solo-contra-bots hay 1 solo match humano por ronda. Al terminar tu match,
-- `resolve_round` caía al `else` y llamaba `advance_tournament()` AL INSTANTE → abría la próxima
-- jornada sin tiempo muerto → el cliente saltaba de un `PenalLive` al siguiente y el bracket/tabla
-- del grupo nunca se veía ("entre partido y partido no se ve nada").
--
-- Fix: separar dos tiempos muertos distintos y NO avanzar en línea en la frontera entre matches:
--   • DENTRO de un match (quedan matches humanos en curso, falta el próximo penal): 3s (snappy,
--     el jugador sigue en la escena de penal, 10.2).
--   • ENTRE matches (la jornada/fase terminó para los humanos): 6s, para ver el bracket. El avance
--     real lo dispara `open_next_round` (poke del cliente + backstop tick()) al vencer el deadline.
-- `open_next_round` ahora ROUTEA: si quedan matches humanos en curso → abre su próximo penal
-- (`open_round_penals`); si no → `advance_tournament` (que simula los bot-only de la próxima jornada
-- vía `open_round`, abre la ronda humana, o corona). Antes `open_round_penals` corría siempre y al
-- cruzar de jornada abría los penales humanos de la jornada siguiente SIN simular sus bot-only.

-- ───────────────────────── resolve_round (tiempo muerto por contexto) ─────────────────────────
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
    -- DENTRO del match: próximo penal del mismo match (10.2) → tiempo muerto corto
    update public.tournaments set round_deadline = now() + interval '3 seconds'
      where id = p_tournament and status = 'in_progress';
  else
    -- ENTRE matches: la jornada/fase terminó para los humanos → tiempo muerto largo para ver el
    -- bracket/tabla del grupo (10.3). NO avanzamos acá; open_next_round lo hace al vencer el deadline.
    update public.tournaments set round_deadline = now() + interval '6 seconds'
      where id = p_tournament and status = 'in_progress';
  end if;
end;
$$;
revoke all on function public.resolve_round(uuid) from public, anon, authenticated;

-- ───────────────────────── open_next_round (routea el avance) ─────────────────────────
create or replace function public.open_next_round(p_tournament uuid)
returns void language plpgsql security definer set search_path = '' as $$
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

  update public.tournaments set round_deadline = null where id = p_tournament;
end;
$$;
grant execute on function public.open_next_round(uuid) to authenticated;
