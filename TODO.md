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
- **Sigue:** D festejos → F (Sentry + telemetría + pantalla de error + robustez cliente) → G (6 invitados) → SPEC.

## Pendiente de revisión con Gino
- **OPS (dashboard):** activar "Leaked password protection" en Supabase Auth.
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

## Verde de referencia (20/11)
typecheck · lint · knip · assets 91 · unit 267 · components 52 · db 135 · build · perf:budget · e2e 46 · flow 15 ·
smoke prod 46 + penal de invitado en prod.
