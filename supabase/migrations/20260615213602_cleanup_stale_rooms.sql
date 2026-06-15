-- Tanda — F4 / mantenimiento: janitor de salas (anticipa parte de 4.7 tick()).
--
-- Evita que la tabla rooms (y su cascada a tournaments/participants) crezca con basura de
-- pruebas/abandonos. Dos pasos:
--   1) Lobbies vencidos → cancelled. PRE-F5 una sala cuyo countdown venció no puede arrancar
--      (start_tournament es F5), así que se cancela. En 4.7 esto se reemplaza dentro de tick()
--      por "arrancar si hay ≥1 humano, cancelar si no".
--   2) Retención: las salas cancelled son terminales y sin valor (no se jugó nada) → se borran
--      tras 1 día. La cascada (FKs on delete cascade) limpia tournaments y participants.
--
-- pg_cron lo corre cada 15 min. La función es solo para mantenimiento: nadie del cliente la
-- ejecuta (revoke a public/anon/authenticated).
create or replace function public.cleanup_stale_rooms()
returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.rooms
    set status = 'cancelled'
    where status = 'lobby' and starts_at <= now();

  delete from public.rooms
    where status = 'cancelled' and created_at < now() - interval '1 day';
end;
$$;
revoke all on function public.cleanup_stale_rooms() from public, anon, authenticated;

select cron.schedule(
  'tanda-cleanup-rooms',
  '*/15 * * * *',
  $$select public.cleanup_stale_rooms();$$
);
