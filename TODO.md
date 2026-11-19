# TODO — TANDA ⚽

En prod: https://tanda2026.com.ar (Mundial + Modo Argentina + Ranked 1v1, invitado, avatar v2).

## Plan
_(vacío: el próximo plan va acá)_

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

## Verde de referencia (17/11)
typecheck · lint · knip · assets · unit 209 · components 48 · db 108 · build · e2e 42 · flow 9 · smoke prod 42 +
penal de invitado en prod.
