# Historia de Tanda

Resumen de lo que ya se hizo. El detalle de cada etapa (planes, handoffs, auditorías) vive en git: el TODO
largo, `docs/PLAN-FEEDBACK-2.md`, `docs/AUDIT-2026-11.md` y `docs/avatar-qa/REVIEW.md` se pueden leer
completos con `git show 39d6312:<archivo>` (último commit antes de la limpieza del 17/11).

## v1 (jun 2026) — fases F1–F10

- **F1–F2**: Next.js + TS estricto + Tailwind + Supabase + CI; deploy en Vercel; auth por username +
  contraseña, perfil, historial y recuperación por email opcional.
- **F3–F4**: motor del penal y de la tanda en TS puro (`lib/engine/`, RNG mulberry32 por seed); matchmaking,
  lobby con Presence, Broadcast sin `correct_index`, `select_option`/`resolve_penalty` en plpgsql con paridad
  bit a bit contra TS, `tick()` por pg_cron, reloj de ronda compartido.
- **F5–F7**: 48 naciones, bots por dificultad de su nación, motor de torneo (grupos, desempates FIFA, terceros,
  bracket hasta la final), banco de preguntas con dificultad por fase.
- **F8**: invitado = usuario anónimo real (upgrade a cuenta), escena de penal 3D, bracket en vivo, HUD, audio,
  compartir sala, campeón.
- **F9**: auditoría RLS + anti-trampa como test durable (`rls_audit`), estados de carga/error, a11y, rate limit,
  suite SQL/RPC contra Postgres local en CI (9.0).
- **F10**: solo las 48 clasificadas; respuesta no cambiable (primer tap fijo); ajustes de timing medidos en prod
  (lección: el timing autoritativo vive en el cron y en los deadlines del server, no en pokes del cliente).

## Tanda 2.0 (13–14/11/2026)

- **Wipe + baseline limpio** (13/11): las ~45 migraciones originales se consolidaron en `baseline_v2` +
  `wiring_v2` + seeds; incrementales encima.
- **Rebrand "B · Programa de partido"**: papel/tinta/rojo/azul, Big Shoulders + Instrument Sans, primitivas con
  borde de tinta y sombra offset, kit visual en `/dev/kit`.
- **Modo Argentina** (2 zonas + interzonal + octavos) junto al Mundial.
- **Ranked 1v1**: Elo con divisiones Potrero→Leyenda, escudo de 3 derrotas, temporadas, cola con ventana que se
  abre, settle idempotente; `/ranked`, `/ranking`.
- **Preguntas**: 1400 (700 Mundial + 700 AR), verificadas dato por dato; `pnpm questions:check` en CI
  (casi-duplicados, filtraciones, balance de posición/categoría); temas para no repetir el mismo hecho.
- **3D con GLB**: personajes CC0 de Quaternius, rig propio por keyframes, jugada determinista
  (`lib/penal/shot.ts`).
- **Cierre (Fase 7)**: Lighthouse mobile 98/100/96/100, Playwright + axe, índices de FKs, advisors revisados.
- **Endurecimiento**: CSP enforced (con fixture e2e anti-violaciones), grants explícitos de tablas y funciones
  (prod tenía grants heredados del ACL viejo de la plataforma), e2e del flujo de juego contra Supabase local,
  fix del invitado colgado en "Entrando…" (PGRST303 "JWT issued at future" → reintento único).

## Plan Feedback 2 (14–16/11/2026)

P0 F4 en prod (TTFB p50 ~180 ms) · P1 deps mayores (three 0.187, vitest 5, eslint 10, TS 6, Supabase CLI 3) ·
P2 limpieza (fuera el muñeco procedural; T-pose imposible: la instancia nace posada) · P3 tiempos en una sola
fuente (`TIMING` ↔ `game_timing()`) y salas de 30 s · P4 layout único (scrollea el documento, footer siempre)
· P5 máquina de estados del fin de partido/torneo · P6 ayuda por modo · P7a QA visual del avatar
(`pnpm qa:avatar`, cobertura de pelo, botines cerrados, tinte por luminancia) · P7b–c avatar v2 (catálogo único,
migración de prod con backup) · P7d creador nuevo (pestañas con cámara, presets, aleatorio, deshacer).
Además: tests de componentes con RTL (`pnpm test:components`).

## 16–17/11/2026

- Avatar: cuello de la remera liso, cola de caballo para mujer (reemplaza al rapado), línea del pelo lisa en la
  sien del casquete F. PR #4, en prod el 17/11 (migración `avatar_ponytail`).
- **Limpieza integral** (17/11): ramas y worktrees mergeados borrados (`wip/p5-fin-de-partido` archivada como tag
  `archive/wip-p5-fin-de-partido`), compat v1 del avatar fuera (TS + SQL), tablas de backup de prod borradas
  después de exportarlas fuera del repo (ver `TODO.md`), docs cumplidos condensados acá.
