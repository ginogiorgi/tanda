# TODO — TANDA ⚽

## SEGUÍ (arrancar acá — al decir "seguí", planear y ejecutar esto)

App terminada (F0–F10) y en prod. La última sesión fue de pulido pre-lanzamiento (limpieza,
optimización, metadatos/PWA, consolidación de migraciones, tipado del cliente). **Quedan 2 cosas
por cerrar** — armar un plan para ambas y ejecutarlo:

1. **Verificación full pendiente.** El último commit (tipado del cliente, `lib/supabase/database.types.ts`
   + `<Database>` en los clientes) pasó `typecheck`, pero NO se corrió `lint`/`build`/`test`/`test:db`
   después. **Correr la suite completa primero y confirmar verde** (debería estarlo: es type-only).

2. **Migraciones de Supabase — reconciliar prod con el baseline.** Las migraciones locales se
   consolidaron de 45 → **3 archivos** (`20260614000000_baseline_schema` + `..001_wiring` +
   `..002_seed`), verificadas por `db:reset` + 51 pruebas db. El **esquema de prod ya ES ese baseline**
   (se dumpeó de local == prod) → no hace falta DDL nuevo. PERO el **ledger de migraciones de prod**
   (`supabase_migrations.schema_migrations`) todavía lista las 45 entradas viejas → queda incoherente
   con los 3 archivos. Plan a definir: como está en **testing (sin data real)**, la opción limpia es
   **resetear la DB de prod y aplicar los 3 archivos de cero** (o `supabase migration repair` del ledger
   remoto). OJO: el CLI nuevo exige **token de plataforma** (`SUPABASE_ACCESS_TOKEN` / `supabase login`)
   para `migration repair` y para `gen types` — pedírselo a Gino al arrancar (puede correrlo con `!`).
   Al reconciliar: re-verificar que prod queda igual + (bonus) regenerar `Database` con `gen types`
   real para reemplazar el hecho a mano. Ver memoria `tanda-sql-migrations-canonical`.

Verde de referencia (antes del commit de tipado): `typecheck` · `lint` · `build` · **102 unit** + **51 db**.
Front: push a `main` → Vercel (https://tanda2026.com.ar). DB: por Supabase MCP (`apply_migration`).

## Cómo correr / testear / deployar

```bash
pnpm dev | build | lint | typecheck      # desarrollo + checks
pnpm test                                 # unit (motor de juego/torneo)
pnpm db:start && pnpm db:reset && pnpm test:db   # suite SQL/RPC (Docker)
```

- **Deploy front**: commit + `git push origin main` (Vercel publica solo).
- **Deploy DB**: aplicar cada migración nueva de `supabase/migrations/` a prod por MCP
  (`apply_migration`), en orden de timestamp; correr `get_advisors` después.

## Dónde vive cada cosa

- `lib/engine/` — motor TS puro y determinista (regla del juego + modo invitado). Testeable
  sin red. Su **port fiel a plpgsql** (verificado por paridad) corre el camino autoritativo.
- `supabase/migrations/` — esquema + RPCs `SECURITY DEFINER`: **fuente de verdad** de la DB.
- `supabase/tests/` — suite del camino autoritativo (CI guardrail).
- `app/` — rutas (Server Components). `components/` — UI. 3D (R3F) solo en avatar y penal.

## Hecho la última sesión (registro)

Limpieza de docs + código/deps muertos (knip: −`@react-three/drei`), paralelización de queries en
server pages, metadatos de lanzamiento (OG/SEO) + PWA (manifest + íconos generados), consolidación
de migraciones (45 → 3), y tipado del cliente (`Database` a mano en `lib/supabase/database.types.ts`).
Detalle en el git log.

> Bonus opcional (no bloquea): knip en CI como guard de código muerto.

> Protocolo: una cosa a la vez, verificar con output real, commit descriptivo. Cambios de
> arquitectura grandes → consultar a Gino primero.
