-- ════════════════════════════════════════════════════════════════════════════
-- F2 — Cron tick de 10s → 1s. CAUSA RAÍZ del tiempo muerto en prod.
--
-- Diagnóstico (timestamps reales de prod): TODAS las transiciones de penal (abrir, resolver,
-- abrir el próximo) caían EXACTO en un tick del cron de 10s. Los pokes del cliente (resolve_penalty
-- al countdown=0, open_next_round al vencer el round_deadline) NO surtían efecto → el juego avanzaba
-- solo por el cron, esperando siempre al próximo múltiplo de 10s. De ahí los ~10-20s de tiempo muerto.
--
-- Fix: el camino autoritativo deja de DEPENDER del poke frágil del cliente. El cron a 1s ejecuta
-- tick() (resuelve penales vencidos + abre rondas cuyo round_deadline venció) con ≤1s de jitter.
-- El poke del cliente queda como optimización (cuando funciona, timing exacto sin jitter).
--
-- Escala (SPEC §C): si la carga lo pide, subir este intervalo. tick() corre en ~30ms con los
-- índices C1/C2 y techos por vuelta dimensionados a 1000+; a 1s eso es ~3% de un core.
-- ════════════════════════════════════════════════════════════════════════════

-- cron.schedule hace upsert por nombre del job → re-agenda 'tanda-tick' a 1s.
select cron.schedule('tanda-tick', '1 seconds', $$select public.tick();$$);

-- A 1s, cron.job_run_details crece ~86k filas/día → podarlo en el job de limpieza (cada 15 min)
-- para que no infle el storage. Mantiene ~2h de historial para diagnóstico.
select cron.schedule(
  'tanda-cleanup-rooms',
  '*/15 * * * *',
  $$select public.cleanup_stale_rooms(); delete from cron.job_run_details where start_time < now() - interval '2 hours';$$
);
