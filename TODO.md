# TODO — TANDA ⚽

## ⏸ HANDOFF — Limpieza integral (17/11)
Pedido de Gino (17/11 04:22, Telegram): OK para todo, incluido deploy a prod, sin consultarle. Fases en orden,
cada una verde antes de seguir. Si se corta por usage, retomar desde la primera fase sin ✅.
1. **AVATAR** — recorte liso (shader, como el del cuello) para la línea dentada del pelo en la sien del casquete F
   (`Hair_BuzzedFemale`); capturas `qa:avatar` antes/después. Después publicar PR #4: tests completos → merge a
   main → deploy prod → migración `20261124000006_avatar_ponytail` por MCP + ledger → smoke prod.
   - ✅ HECHO 17/11: sien lisa + PR #4 en prod (`c5c65c1`), migración + ledger, smoke prod verde.
2. **LIMPIEZA INTEGRAL** — backups (.bak/.old/copias), ramas wip mergeadas, worktrees viejos (`../tanda-feedback` si
   está todo mergeado), `artifacts/` y salidas de QA sin uso, código muerto, exports/deps sin uso (knip), assets
   huérfanos, docs/planes cumplidos (→ `docs/HISTORY.md`), comentarios obsoletos, flags/compat viejos.
   **DB prod (agregado de Gino 04:25):** borrar también las tablas/copias de backup (`*_backup` y similares). Por
   cada una, ANTES del DROP: (a) verificar que los datos vivos estén bien, (b) exportarla a
   `/mnt/hera/Backups/tanda-db/2026-11-17/<tabla>.sql` (fuera del repo, nunca commiteado). Recién después DROP por
   migración + ledger. Anotar acá qué se borró y dónde quedó cada export. Nunca borrar datos vivos.
   - ✅ HECHO 17/11: ver "Limpieza integral" abajo.
3. **OPTIMIZACIÓN** — buenas prácticas actuales (Next App Router, React 19/Compiler, three/R3F, Supabase, bundle,
   CWV) archivo por archivo, sin cambiar comportamiento; documentar en `docs/` con fuentes.
   - ✅ HECHO 17/11: ver `docs/OPTIMIZATION.md` (AuthShell + fix de doble footer, `use client` de más, React
     Compiler medido y descartado por presupuesto de JS).
4. **VERIFICACIÓN Y PROD** — batería completa (typecheck, lint, unit, components, db, e2e, layout, smoke), comparar con
   `docs/PERF-BASELINE.md`, merge a main, deploy prod, smoke prod. Nunca dejar prod roto.
Al terminar: sacar este HANDOFF, resumen corto arriba y commit. Respetar protocolo de 90% de usage.

## Estado (17/11/2026)
En prod (https://tanda2026.com.ar): Mundial + Modo Argentina + Ranked 1v1, invitado anónimo, avatar v2 GLB con
creador nuevo (cola de caballo, cuello y sien lisos). Historia completa en [`docs/HISTORY.md`](docs/HISTORY.md).

### 🧹 Limpieza integral (17/11)
- **Git:** borradas las ramas mergeadas (locales y remotas) y el worktree `../tanda-feedback` (limpio, en
  `wip/p7a` ya mergeada). `wip/p5-fin-de-partido` (snapshot del 15/11, contenido ya en main por otra rama) quedó
  como tag `archive/wip-p5-fin-de-partido`. Queda solo `main`.
- **DB prod — tablas de backup BORRADAS** (migración `20261124000007_cleanup_backups_avatar_v1` + ledger). Antes:
  datos vivos verificados (19 perfiles v2 válidos, 0 huérfanos; `ranked_players` consistente) y export con hash
  de filas idéntico a prod (cargado en el Postgres local en una tx revertida):
  - `profiles_avatar_backup` (16 filas, avatares v1 previos al 16/11) →
    `/mnt/hera/Backups/tanda-db/2026-11-17/profiles_avatar_backup.sql`
  - `ranked_players_backup_1411` (2 filas, ranked al 14/11) →
    `/mnt/hera/Backups/tanda-db/2026-11-17/ranked_players_backup_1411.sql`
  Cada archivo trae DDL + filas y se restaura corriéndolo en la DB. Fuera del repo, nunca commiteado.
- **Compat v1 del avatar fuera:** `migrateAvatar`/`LEGACY_SKIN`/`V1_HAIR`/`lib/avatar/fixtures.ts` y, en SQL, el
  port v1 de `avatar_to_v2` + `avatar_palette`/`avatar_hex_lab`/`avatar_nearest`. Lo que no es v2 → default.
- **Código/deps/assets:** `pnpm knip` y `pnpm assets:check` limpios (no había nada muerto ni huérfano).
  Sin archivos `.bak`/`.old`/copias; `artifacts/` no existía; borradas `test-results*` locales.
- **Docs:** el TODO largo, `PLAN-FEEDBACK-2.md` (cumplido), `AUDIT-2026-11.md` y `avatar-qa/REVIEW.md` →
  condensados en `docs/HISTORY.md` (texto completo: `git show 39d6312:<archivo>`).

## Pendiente de decisión de Gino
- **Avatar:** (1) barba: no está en el GLB; requiere re-bajar el pack Standard (CC0) y `pnpm avatar:build`.
  (2) Miniaturas de presets = chips de color, no renders (si querés renders, es un script). (3) Sin aviso de
  "cambios sin guardar" al volver del creador. (4) Botín único con tapones.
- **Ranked:** falta probarlo con 2 personas reales en prod (cola → partido → puntos).
- **Preguntas:** verificadas dato por dato; queda una pasada de gusto/tono. Recalibrar dificultad con aciertos
  reales cuando haya tráfico.
- **Datos AR:** ⚠️ GOD y TSU son provisorios (ascensos 2027) → migración chica de `teams` + escudos al definirse.
  `kit_pattern` de `data/teams/arg.json` aproximados.
- **UI:** micro-rótulos de 10px en HUD del penal, perfil, ranked y ranking → subir a 12px donde entre.
- **3D:** la escena corre en loop continuo (idle animado) salvo reduced motion; si en gama baja se nota la batería,
  volver a "demand" en idle.
- **Compat que queda (a propósito):** `penalties.removed_option` (columna vieja = la del pateador; el cliente la
  usa normalizada). Sacarla toca `resolve`/`game_timing` en plpgsql → solo en una tanda propia con paridad.

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
- Docs: `docs/BRIEF.md` (producto), `SPEC.md` (arquitectura/contratos), `docs/DESIGN-RULES.md`,
  `docs/PERF-BASELINE.md`, `docs/OPTIMIZATION.md`, `docs/HISTORY.md`.

## Verde de referencia (17/11)
typecheck · lint · knip · assets · unit 209 · components 48 · db 108 · build · e2e 42 · flow 9 · smoke prod 42 +
penal de invitado en prod.
