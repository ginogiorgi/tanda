# TODO — TANDA ⚽

## Feedback 4 — en curso (22/11)
Plan: auditoría integral + 20 correcciones (F0 → A1 → A2–A5 → B → C → D → E → F → G).
- **F0 (hecho, en prod):** torneo congelado `2d39f332` → carrera en el cierre de ronda (dos `resolve_penalty`
  concurrentes, ninguno fijaba `round_deadline`). Advisory lock de ronda en `resolve_penalty`/`resolve_round` +
  watchdog en `tick()` que destraba y registra en `ops_events` (`round_stall_healed`, `tick_error`). Test
  `supabase/tests/round_race.test.ts` (2 conexiones reales, pausa el cron local). Prod destrabado solo al aplicar.
- **A (hecho, en prod):** deps a latest (TS 7 para typecheck, TS 6 lado a lado), tokens de color con lint, auditoría
  de DB (índices FK, podas de invitados 14 d / rate_limits / bot_intents / ops_events, fuera `open_penalty`),
  CI en Node 24 + smoke/axe en CI. Detalle en `docs/AUDIT.md`. SPEC.md se reescribe al cierre (B–F cambian contratos).
- **B + E + parte de C (hecho):** `ExpandableList` (botón al final, sin fila duplicada) en /hinchas; taglines sin
  16avos/octavos; ayuda Ranked sin "Liga"; ficha de liga fuera del perfil → tarjeta Ranked de /jugar con
  `LeagueLadder` (escudos de la división de abajo/arriba, zonas de ascenso/descenso por `ladder()` = ±K/2, posición,
  escudo); "Ranking de jugadores" en la home (`/ranking`, padre `/`); sala sin Compartir; sin "Penal Nº · Elegí";
  globo de sonido arriba a la derecha; zonas/grupos todos iguales A→L ("Zona A/B", la tuya con borde de marca,
  "Ir a mi grupo" en Mundial). Pantallazo/reinicio (#12/#14): la escena vive en una posición fija de `PenalView`
  (test de montajes + mismo `<canvas>` en game.spec), `useGlbReady` sincrónico si el GLB ya cargó, placeholder
  color cielo. `hydrate()` descarta el cartel de un penal viejo. Opciones del penal con `data-option` (selector e2e).
- **C (hecho):** footer fuera del juego por estructura (lo montan `(app)`/`(auth)`/`(site)`/404/error; la home y
  `/auth/reset` pasaron al grupo `(site)`), `assertLayout` exige 0 footers y sin scroll en celu en juego (`game`/`stage`).
  Cartel `PenaltyResultBalloon`: papel 70 % + trama, talón opaco con la correcta (AA), comparado en `/dev/penal?card=`.
  `cn` declara las utilidades propias a tailwind-merge (`bg-halftone` se comía el color de fondo) + test que lee
  globals.css. axe de página completa vía `e2e/_axe.ts` (espera el `<title>` de la navegación cliente).
- **D (hecho):** 5 festejos de gol (Siuuu, cielo, brazos cruzados, cuna, rodillazo) en `lib/avatar/celebrations.ts`,
  uno por penal según `penalty_id` (igual en todos los clientes). Rig con tobillos. En el gol la cámara se acerca al
  pateador (`celebrationCamera`): de lejos medía ~30 px. Guards FK con el GLB real + test de cámara; QA con
  `pnpm qa:celebrations`, `/dev/penal?celebration=` y `shots.sh` (`SHOTS_CEL`). Detalle en `docs/celebrations.md`.
- **F (hecho):** telemetría propia (`client_events` + `log_client_event` con rate limit, poda 30 d;
  `fire(req, label)` registra los errores de PostgREST/red con muestreo en `lib/telemetry/client.ts`). Pantalla de
  error de marca (`components/feedback/ErrorScreen`: `app/error.tsx`, `app/global-error.tsx` y el juego trabado) que
  reporta sola (`POST /api/feedback` `kind:"auto"` → `submit_auto_report`: una fila por fingerprint, mail ≤ 1 cada
  24 h); "Avisar" solo agradece. Aviso del watchdog del server: cron `tanda-ops-notify` → pg_net →
  `/api/ops/notify` (URL en Vault `ops_notify_url`), un mail por tipo+torneo+paso cada 24 h. `PenalLive`: adopta solo
  fases más nuevas (`isNewerPhase`) desde broadcast/rehidratación/poll del padre (`serverPenal`), resuscribe el
  canal con backoff ante CHANNEL_ERROR/TIMED_OUT/CLOSED, `setAuth` en TOKEN_REFRESHED y watchdog (hueco + 3 s o
  deadline + 3 s → rehidrata y pokea; 45 s sin avanzar con el partido vivo → pantalla de error). e2e
  `e2e/flow/chaos.spec.ts` (apagón de 9 s a mitad del cartel). En prod: pg_net no estaba creado (drift, migración
  `pg_net`), Vault `ops_notify_url` configurado; verificado el mail del watchdog y 5 reportes auto = 1 mail.
  **Sentry (22/11):** integración Marketplace (plan Developer, USD 0). Cliente PEREZOSO (`lib/telemetry/sentry.ts`, el
  SDK se baja recién al primer error: 0 KB en la carga inicial), solo en Vercel (`NEXT_PUBLIC_VERCEL_ENV`), sin PII
  (`dataCollection` todo apagado), user id como sha256 de 16 hex, sin trazas ni replays. Le llegan la pantalla de
  error / juego trabado (`sendAutoReport`) y de la telemetría solo `rpc_error:*` y `penal:stall_fatal`. Túnel propio
  `app/sentry-tunnel/route.ts` (solo nuestro DSN: ajeno → 403). Server: `instrumentation.ts` (`onRequestError`).
  `withSentryConfig` SOLO en builds de Vercel: sube source maps y los borra del output. Esto suma ~1,5 KB gz por
  ruta en prod (debug ids) que `perf:budget` local no ve; Gino lo aprobó el 22/11 (stacks legibles > ese peso).
- **SPEC.md reescrito (22/11)** al estado actual (modos, ranked, TIMING, carrera de ronda, cliente del penal,
  telemetría, cron). **G (22/11):** `pnpm qa:ranked-sim` en prod: 166 partidos, **0 fallas**, 4 divisiones
  (Potrero, Barrio, Primera, Libertadores). Reporte en `artifacts/qa/ranked-sim.md` (gitignored). Cuentas `qa_*` quedan.
- **Plan Feedback 4: TERMINADO (22/11).** Capturas de G con `pnpm qa:ranked-shots [Perfil]`
  (`artifacts/qa/ranked-{ranking,jugar}-{mobile,desktop}.png`, prod logueado como `qa_*`). Gino pausó Tanda por otro
  proyecto: no arrancar nada sin su OK. Hallazgos de las capturas (22/11): botón "JUGAR RANKED" de `/ranking`
  partido en 2 líneas → `shrink-0 whitespace-nowrap`; footer tapado por el botón flotante en mobile → `pb` extra
  debajo de `sm`. La barra de la tarjeta ranked (división de abajo → de arriba) es el diseño de #7, no un bug.
## Plan 5 — Operación gratis, carga, analytics, tipos y limpieza (22/11, en curso)
Decisiones de Gino (22/11): solo pagaría Supabase Pro cuando haya gente; ranked con poca gente y calidad de
experiencia (tutorial, reportar pregunta, peso de `/partido`) quedan fuera. Orden:
- **O — Operación gratis:** (O1) keepalive diario para que Supabase free no pause el proyecto (cron de Vercel →
  ruta que hace una lectura real a la DB); (O2) backup semanal propio (`pnpm db:backup` → dump + md5 a
  `/mnt/hestia/Backup/tanda-db`, timer de systemd en cronos); (O3) Realtime lleno (200 conexiones del free): el canal
  que no puede suscribirse avisa claro en vez de quedar mudo.
  **O hecho (22/11):** O1 `app/api/cron/keepalive` + cron diario en `vercel.json` (sin `CRON_SECRET`: el modo auto
  no me deja crear envs en Vercel; la ruta solo lee, es opcional). O2 `pnpm db:backup` (`scripts/db/backup.mts`:
  tablas por PostgREST + `auth.users`, gz + md5, rota los últimos 8 `*-auto`) en `/mnt/hera/Backups/tanda-db` (no
  tengo acceso a hestia); timer `systemctl --user tanda-backup.timer`, domingos 11:00. O3 ya cubierto por la Fase F
  (poll del padre + watchdog sin Realtime; e2e `chaos`): sin código nuevo.
- **W — Vercel Web Analytics** (Hobby, gratis): `@vercel/analytics`, sin PII, dentro del presupuesto de JS.
- **L — Prueba de carga:** `scripts/qa/load-sim.mts`, N invitados `qa_load_*` (persistentes, `qa_keep`) en UNA sala
  de prod jugando un torneo entero por API + Realtime; mide huecos entre penales, latencia de RPC (p50/p95), pokes
  no-op y trabas; reporte en `artifacts/qa/load-sim.md`. Cualquier hallazgo → arreglo con test de DB. Incluye
  investigar el hueco de 8,35 s del CI.
- **T — Tipos y drift:** `database.types.ts` generado (`supabase gen types`) + chequeo en CI; huella del esquema
  (`pnpm db:fingerprint`) para comparar local vs prod y atrapar drift (pg_net, grants).
- **Z — Limpieza:** revisar TODOS los tests, archivos, funciones y scripts: sacar lo que sobra (código muerto,
  tests duplicados o triviales, scripts sin uso, páginas dev viejas), simplificar y acelerar la suite. Medir antes
  y después (archivos, líneas, tiempo de cada suite, KB por ruta).

## Pendiente de revisión con Gino
- **Festejos (#16):** el gesto de los índices de Messi se expresa con los brazos al cielo (sin dedos: con el primer
  plano miden 2–3 px). Y en el gol la cámara pasa a primer plano del pateador desde 1,7 s (el arco queda arriba).
- **CI `e2e-flow` (20/11):** el runner suma ~1 s a los huecos (tolerancia ±1,5 s en CI). Además, una vez `game.spec` vio un
  hueco de 8,35 s entre penales (los otros 9: 4,5–5,1 s; un solo humano en el torneo). La traza muestra al cliente
  pokeando `open_next_round` cada 1 s con no-op durante ~4 s más de lo esperado → el server abrió tarde. Localmente
  (15 corridas de flow) y en el suite `db` (`_drive`, huecos exactos con 2ª chance y muerte súbita) no aparece.
  Hipótesis: `tick()`/pokes compitiendo en una máquina lenta. Próximo paso si se repite: loguear en el test los
  `round_deadline` desde la DB (`E2E_DB_URL`) para ver si es el deadline o la apertura.
- **Cola ranked por Presence (F1.6):** cuenta a quien tiene abierta la pantalla de cola (= encolado). Es exacto y no
  toca la DB; la alternativa por DB costaba un COUNT por jugador cada 2 s.

## Cómo correr / testear / deployar
```bash
export PATH=$HOME/.npm-global/bin:$PATH           # pnpm no está en el PATH de las shells de Claude
pnpm dev | build | lint | typecheck | knip         # desarrollo + checks
pnpm test && pnpm test:components                  # unit (motor, avatar) + componentes (RTL)
pnpm db:start && pnpm db:reset && pnpm test:db     # suite SQL/RPC contra Postgres local (Docker)
pnpm test:e2e                                      # Playwright + axe sobre páginas públicas (smoke + layout)
pnpm e2e:stack && pnpm db:reset && pnpm test:e2e:flow   # flujo de juego contra Supabase LOCAL (nunca prod)
E2E_BASE_URL=https://tanda2026.com.ar pnpm test:e2e     # smoke contra prod
E2E_BASE_URL=https://tanda2026.com.ar E2E_PROD_GUEST=1 pnpm exec playwright test e2e/prod-guest.spec.ts
pnpm assets:check | perf:budget | questions:check | db:check-migrations | qa:avatar
pnpm brand:icons | brand:divisions | crests:build   # generadores de SVG (Python + fonttools)
```
- **Deploy front:** `git push origin main` → Vercel (gru1) → https://tanda2026.com.ar.
- **Deploy DB:** cada migración nueva por MCP `apply_migration` (orden por timestamp). El MCP la versiona con la
  hora real → reconciliar `supabase_migrations.schema_migrations` al nombre del archivo; después `get_advisors`
  (lo esperado: RLS sin policy en tablas de juego, RPC `SECURITY DEFINER` de juego, anon sign-ins).
- **Orden:** front primero si la migración depende del front nuevo; nunca dejar prod roto.

## Dónde vive cada cosa
- `lib/engine/` — motor TS puro y determinista (fuente de la regla). `lib/avatar/`, `lib/penal/` — avatar y jugada.
- `supabase/migrations/` — esquema + RPCs: fuente de verdad de la DB (baseline v2 del 13/11 + incrementales).
- `supabase/tests/` — suite del camino autoritativo (paridad TS↔SQL, anti-trampa, RLS, torneo, ranked).
- `app/` — rutas (Server Components; grupos `(app)`, `(game)`, `(auth)`), `components/` (UI; primitivas en
  `components/ui/`), `e2e/` (Playwright), `scripts/` (assets, catálogo, preguntas, QA, perf).
- Docs: `docs/BRIEF.md` (producto), `SPEC.md` (arquitectura/contratos), `docs/DESIGN-RULES.md`, `docs/AUDIT.md` (auditoría 22/11).

## Verde de referencia (22/11, fase F)
typecheck · lint · knip · assets 91 · unit 325 · components 63 · db 149 · build · perf:budget · e2e 46 · flow 16 ·
smoke prod 46.
