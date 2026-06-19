# TODO — TANDA ⚽

## Estado: shippeado y al día

El plan maestro de limpieza/optimización/features (Fases A-E) está **completo y en producción**
(2026-06-19). No hay trabajo abierto salvo gates manuales (abajo). Verde de referencia:
`typecheck` · `lint` · `build` · `knip` · **107 unit** + **58 db**.

### Pendientes (solo gates manuales con browser real)
- Ojo visual en `pnpm dev`: kit de 2 colores (banda diagonal), revelación de nación (~2s),
  animación de penal (corre una sola vez), banderas reales + banner de espera (2+ jugadores).
- **Lighthouse** en prod (LCP/INP/CLS) sobre la landing y el lobby.

## Cómo correr / testear / deployar

```bash
pnpm dev | build | lint | typecheck      # desarrollo + checks
pnpm knip                                 # guard de código muerto
pnpm test                                 # unit (motor de juego/torneo)
pnpm db:start && pnpm db:reset && pnpm test:db   # suite SQL/RPC (Docker)
```

- **Deploy front**: commit + `git push origin main` (Vercel publica solo → https://tanda2026.com.ar).
- **Deploy DB**: aplicar cada migración nueva de `supabase/migrations/` a prod por MCP
  (`apply_migration`, orden de timestamp); el MCP versiona con la hora real → reconciliar el ledger
  (`supabase_migrations.schema_migrations`) para que matchee los filenames; `get_advisors` después.

## Dónde vive cada cosa

- `lib/engine/` — motor TS puro y determinista (regla del juego + modo invitado). Testeable
  sin red. Su **port fiel a plpgsql** (verificado por paridad) corre el camino autoritativo.
- `supabase/migrations/` — esquema + RPCs `SECURITY DEFINER`: **fuente de verdad** de la DB.
  Set canónico de 5: `baseline_schema` · `wiring` · `seed` · `session_fixes` · `session_b2_c_optim`.
- `supabase/tests/` — suite del camino autoritativo (CI guardrail).
- `app/` — rutas (Server Components). `components/` — UI. 3D (R3F) solo en avatar y penal.

## Registro de sesiones (resumen)

- **2026-06-19 (Fases B-E + deploy):** B2 revelación de nación + `begin_presentation` (reloj de
  presentación relativo a la llegada), B3 animación de penal una sola vez, B4 poke al deadline exacto
  (2ª chance), B5 banderas reales (SVG locales en `public/flags/`) + banner de espera. Fase C: índices
  `questions`/`tournaments`, `tick()` con techos+logging, `quick_play` sin lock global, docs de escala
  (SPEC §11). Fase D: JSON-LD + metadata por ruta + noindex en privadas. Fase E: code-split de three
  confirmado + fonts/flags lazy. Migraciones de la sesión consolidadas en `session_b2_c_optim` y
  **aplicadas a prod** (ledger reconciliado, advisors sin alertas nuevas). Push a `main`.
- **2026-06-18:** 16 fixes de gameplay/UI + `session_fixes` (lead-in de ronda, `get_penalty_result`,
  2ª chance por jugador, history con datos del final).
- **Previa:** limpieza de docs + dead code (knip), paralelización de queries, OG/SEO/PWA,
  consolidación de migraciones, tipado del cliente Supabase.

> Protocolo: una cosa a la vez, verificar con output real, commit descriptivo. Cambios de
> arquitectura grandes → consultar a Gino primero.
