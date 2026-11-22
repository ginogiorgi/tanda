# TODO — TANDA ⚽

## Feedback 4 — en curso (22/11)
Plan: auditoría integral + 20 correcciones (F0 → A1 → A2–A5 → B → C → D → E → F → G).
- **F0 (hecho, en prod):** torneo congelado `2d39f332` → carrera en el cierre de ronda (dos `resolve_penalty`
  concurrentes, ninguno fijaba `round_deadline`). Advisory lock de ronda en `resolve_penalty`/`resolve_round` +
  watchdog en `tick()` que destraba y registra en `ops_events` (`round_stall_healed`, `tick_error`). Test
  `supabase/tests/round_race.test.ts` (2 conexiones reales, pausa el cron local). Prod destrabado solo al aplicar.

## Feedback 3 — hecho (18–20/11, en prod)
Fase por fase, con verde completo + deploy + smoke de prod en cada una. Capturas reproducibles:
`bash scripts/e2e/shots.sh [filtro]` (PNG en `artifacts/shots/`, 390×844 y 1440×900).
- **F1:** fuera textos/globos/"Deshacer"; cola ranked "N esperando" por Presence (cero consultas); no repetir
  preguntas entre torneos (`user_seen_questions`, todos los modos); perfil sin desborde.
- **F2:** el penal se resuelve solo al vencer los 10 s; jugada sin cartel → cartel 2,5 s → próximo penal
  (`TIMING.revealS/resultCardS` ↔ `game_timing()`); `fire()` para los pokes (`supabase.rpc()` es perezoso).
- **F3:** cámara dron (`lib/penal/camera.ts`), atajada paramétrica con test de cinemática sobre el GLB, arco de un tubo.
- **F4:** footer en el flujo, home y /jugar sin scroll en PC (hero compacto hasta 920 px de alto); zonas de Argentino
  lado a lado.
- **F5:** papelitos del campeón de fondo (capa `-z-[1]`), tirados desde la tribuna; reduced motion = quietos.
- **F6:** botón "Reportar" (home y menú) → `POST /api/feedback` (5/h y 20/día por usuario e IP, `feedback_reports`)
  → mail con asunto fijo `[Tanda] Bug:/Mejora:` a `FEEDBACK_TO` (env de Vercel).
- **F7:** favoritos (club y país) obligatorios al registrarse, `/hinchas` con `fan_counts` por trigger, prioridad de
  favorito en `start_tournament`, escudo/bandera en la sala. Wipe de cuentas en prod el 20/11 con export validado en
  `/mnt/hera/Backups/tanda-db/2026-11-20/` (README + MD5SUMS).
- **F8:** escudos de clubes con una ficha por club parecida al real (`scripts/crests/build_crests.py`); las 48
  banderas revisadas, sin cambios.
- **Hallazgos propios:** CI de `game.spec` (mide jugada + cartel), presupuesto de JS de `/hinchas`, tests que dejaban
  invitados colgados en salas públicas (usar salas privadas y salir).
- **Decisiones de Gino:** reloj común por fecha (un torneo con varios humanos espera al partido más lento, ~10 s en 2ª
  chance) y vista dron (personajes y encuadre) quedan como están.

## Pendiente de revisión con Gino
- **Cierre anticipado del penal (F2.1, hecho):** el penal vuelve a resolverse solo al vencer el tiempo aunque
  respondan los dos (deshace la regla del 14/11). Alternativa si lo querés de vuelta: cierre anticipado + demorar
  solo el cartel (una línea en `resolve_penalty`).
- **Escudos de selecciones (F8.3):** siguen siendo banderas (las 48 revisadas, correctas). ¿Querés además escudos de
  federación parecidos a los reales? (no lo decidiste; el commit `977de28` dice "Gino eligió banderas" por error).
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
- Docs: `docs/BRIEF.md` (producto), `SPEC.md` (arquitectura/contratos), `docs/DESIGN-RULES.md`.

## Verde de referencia (20/11)
typecheck · lint · knip · assets 91 · unit 267 · components 52 · db 135 · build · perf:budget · e2e 46 · flow 15 ·
smoke prod 46 + penal de invitado en prod.
