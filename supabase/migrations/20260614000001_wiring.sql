-- Tanda — wiring que el baseline (pg_dump schema-only de `public`) NO captura:
--   1) el event trigger `ensure_rls` (auto-habilita RLS en tablas nuevas de public),
--   2) las policies SELECT sobre `realtime.messages` (schema `realtime`, fuera del dump),
--   3) los jobs de pg_cron (datos en el schema `cron`, fuera del dump).
-- Las FUNCIONES que usan (rls_auto_enable, realtime_match_member/tournament_member, tick,
-- cleanup_stale_rooms) ya están en el baseline; acá va solo lo que vive en otros schemas.

-- ───────────────────────── 1) event trigger: RLS automática en tablas nuevas ─────────────────────────
drop event trigger if exists ensure_rls;
create event trigger ensure_rls on ddl_command_end
  when tag in ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
  execute function public.rls_auto_enable();

-- ───────────────────────── 2) policies de Broadcast (canales privados, solo miembros) ─────────────────────────
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

-- ───────────────────────── 3) pg_cron: backstop de penales + janitor de salas ─────────────────────────
-- tick(): cierra penales vencidos / abre rondas / arranca o cancela lobbies (backstop del cliente).
select cron.schedule(
  'tanda-tick',
  '10 seconds',
  $$select public.tick();$$
);

-- Janitor: lobbies vencidos → cancelled + retención (borra cancelled > 1 día).
select cron.schedule(
  'tanda-cleanup-rooms',
  '*/15 * * * *',
  $$select public.cleanup_stale_rooms();$$
);
