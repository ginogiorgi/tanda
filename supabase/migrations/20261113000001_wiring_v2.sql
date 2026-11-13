-- Tanda — wiring que el dump schema-only de `public` NO captura:
--   1) event trigger `ensure_rls` (auto-habilita RLS en tablas nuevas de public),
--   2) policies SELECT sobre `realtime.messages` (canales privados de Broadcast, solo miembros),
--   3) jobs de pg_cron.

-- 1) RLS automática en tablas nuevas
drop event trigger if exists ensure_rls;
create event trigger ensure_rls on ddl_command_end
  when tag in ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
  execute function public.rls_auto_enable();

-- 2) Broadcast privado
-- Canal `match:{uuid}` (penal:start/result/second_chance): solo participantes del match.
create policy "match_broadcast_select" on realtime.messages
  for select to authenticated
  using (
    extension = 'broadcast'
    and public.realtime_match_member((select realtime.topic()))
  );

-- Canal `tournament:{uuid}` (score:live): solo participantes del torneo.
create policy "tournament_broadcast_select" on realtime.messages
  for select to authenticated
  using (
    extension = 'broadcast'
    and public.realtime_tournament_member((select realtime.topic()))
  );

-- 3) pg_cron
-- tick() a 1s: el timing autoritativo vive acá (resuelve penales vencidos, abre rondas cuyo
-- round_deadline venció, arranca/cancela lobbies). Los pokes del cliente son solo optimización.
select cron.schedule('tanda-tick', '1 seconds', $$select public.tick();$$);

-- Janitor de salas + poda del historial de cron (a 1s crece ~86k filas/día).
select cron.schedule(
  'tanda-cleanup-rooms',
  '*/15 * * * *',
  $$select public.cleanup_stale_rooms(); delete from cron.job_run_details where start_time < now() - interval '2 hours';$$
);
