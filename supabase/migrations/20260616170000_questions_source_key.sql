-- Tanda — F7 / tarea 7.1b: clave de seed para `questions`.
--
-- Las preguntas del banco (7.2) se cargan por seed idempotente (estilo `seed_nations`), pero
-- `questions` no tiene clave natural. Agregamos `source_key` (única, nullable): las filas de
-- seed traen una clave estable (`wc-001`, …) → `on conflict (source_key) do nothing` re-aplica
-- sin duplicar. Las filas dinámicas (la `dev` del harness, futuras preguntas) quedan con
-- `source_key null` y no chocan (UNIQUE ignora los null en Postgres).
alter table public.questions add column source_key text unique;
comment on column public.questions.source_key is
  'Clave estable de seed (idempotencia). Null en preguntas dinámicas/no-seed.';
