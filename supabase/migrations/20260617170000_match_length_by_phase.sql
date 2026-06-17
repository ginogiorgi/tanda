-- Tanda — F10 / 10.4 + 10.9: longitud de tanda por fase + corte anticipado en ambas fases.
--
-- Port fiel de lib/engine/match.ts (advanceMatch) actualizado:
--   10.4: grupos = 3 penales por lado (6 en regulación); eliminación = 5 por lado (10), como antes.
--   10.9: el partido CORTA apenas el resultado está matemáticamente decidido en AMBAS fases (antes
--         el corte era solo en eliminación). El que va perdiendo no alcanza ni convirtiendo todos los
--         que le quedan → fin.
--
-- progress_match / simulate_bot_match se manejan 100% por el status que devuelve esta función (no
-- hay conteos hardcodeados), así que con cambiarla acá la cadena entera respeta la nueva longitud.
-- Verificado por paridad TS↔SQL (parity.test.ts) y por el e2e de torneo.
create or replace function public.engine_advance_match(
  p_kind text, p_scored boolean[],
  out status text, out next_index int, out next_kicker text,
  out home int, out away int, out winner text
)
language plpgsql immutable set search_path = '' as $$
declare
  n int := coalesce(array_length(p_scored, 1), 0);
  hk int := 0; ak int := 0; i int; home_rem int; away_rem int; sdk int;
  kps int := case when p_kind = 'group' then 3 else 5 end;  -- penales por lado (10.4)
  reg int := (case when p_kind = 'group' then 3 else 5 end) * 2;
begin
  home := 0; away := 0;
  for i in 1..n loop
    if i % 2 = 1 then
      hk := hk + 1; if p_scored[i] then home := home + 1; end if;
    else
      ak := ak + 1; if p_scored[i] then away := away + 1; end if;
    end if;
  end loop;

  -- Regulación en curso: corte por resultado decidido en AMBAS fases (10.9).
  if n < reg then
    home_rem := kps - hk; away_rem := kps - ak;
    if home > away + away_rem or away > home + home_rem then
      status := 'finished'; winner := case when home > away then 'home' else 'away' end; return;
    end if;
    status := 'in_progress'; next_index := n + 1;
    next_kicker := case when (n + 1) % 2 = 1 then 'home' else 'away' end; return;
  end if;

  -- Fin de regulación (n = reg).
  if n = reg then
    if home <> away then
      status := 'finished'; winner := case when home > away then 'home' else 'away' end; return;
    end if;
    if p_kind = 'group' then status := 'finished'; winner := null; return; end if;  -- empate OK
    status := 'sudden_death'; next_index := n + 1;
    next_kicker := case when (n + 1) % 2 = 1 then 'home' else 'away' end; return;
  end if;

  -- Muerte súbita (n > reg, solo eliminación): se decide al cerrar una ronda completa.
  sdk := n - reg;
  if sdk % 2 = 0 and home <> away then
    status := 'finished'; winner := case when home > away then 'home' else 'away' end; return;
  end if;
  status := 'sudden_death'; next_index := n + 1;
  next_kicker := case when (n + 1) % 2 = 1 then 'home' else 'away' end;
end;
$$;
revoke all on function public.engine_advance_match(text, boolean[]) from public, anon, authenticated;
