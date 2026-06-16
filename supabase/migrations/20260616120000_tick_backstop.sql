-- Tanda — F4 / tarea 4.7: `tick()` backstop por pg_cron.
--
-- Red de seguridad del timing event-driven (SPEC §1.3): si TODOS los clientes de un penal se
-- desconectan, nadie hace el "poke" a los 10s. tick() barre los penales abiertos vencidos y
-- los resuelve igual (resolve_penalty corre como backstop: uid null → sin chequeo de
-- pertenencia; igual exige now()>=deadline y es idempotente con SKIP LOCKED, así que no choca
-- con un poke simultáneo del cliente).
--
-- PENDIENTE F5 (cuando existan bots/start_tournament): sumar a tick (a) materializar
-- bot_intents vencidos y (b) en el janitor de salas, "lobby vencido → start_tournament si ≥1
-- humano, cancelar si no" (hoy cleanup_stale_rooms cancela siempre porque start_tournament es
-- F5). Ver cleanup_stale_rooms.
create function public.tick()
returns void
language plpgsql security definer set search_path = '' as $$
declare r record;
begin
  for r in
    select id from public.penalties
    where status in ('open', 'second_chance')
      and deadline is not null and deadline <= now()
    order by deadline
    limit 200   -- acota el barrido por tick; el resto cae en el siguiente
  loop
    -- Un penal que falle no debe abortar el barrido: el próximo tick reintenta.
    begin
      perform public.resolve_penalty(r.id);
    exception when others then
      null;
    end;
  end loop;
end;
$$;
revoke all on function public.tick() from public, anon, authenticated;

-- Cada 10s (el deadline del penal es 10s; el cliente es el camino primario, esto es backstop).
select cron.schedule(
  'tanda-tick',
  '10 seconds',
  $$select public.tick();$$
);
