# TODO — TANDA ⚽

## Estado actual

**Proyecto terminado y en producción** (F0–F10). prod == local.
Verde: `typecheck` · `lint` · `build` · **102 unit** + **51 db**.

- Front: push a `main` → Vercel (https://tanda2026.com.ar).
- DB: las migraciones de `supabase/migrations/` aplicadas a prod por Supabase MCP.
- La historia detallada de cada cambio vive en el **git log**, no acá.

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

## Pendientes (no bloquean)

- **Tipar el cliente** con `supabase gen types` (Database generic) para las `supabase.rpc(...)`.
- **Squash/baseline de migraciones**: hoy hay ~45 migraciones, varias redefinidas con
  `create or replace`. Consolidarlas en un baseline es la limpieza pendiente del directorio
  `supabase/`, pero es **riesgosa** (el replay desde archivos debe seguir == prod) → tarea
  aparte y deliberada, no oportunista. Ver memoria `tanda-sql-migrations-canonical`.

> Protocolo: una cosa a la vez, verificar con output real, commit descriptivo. Cambios de
> arquitectura grandes → consultar a Gino primero.
