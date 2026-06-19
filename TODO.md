# TODO — TANDA ⚽

## SEGUÍ (arrancar acá — al decir "seguí", planear y ejecutar esto)

App terminada (F0–F10) y en prod. La última sesión cerró los 2 pendientes que quedaban (verificación
full + reconciliar el ledger de prod) **y** aplicó 16 fixes de gameplay/UI reportados por Gino tras
jugar. **No hay pendientes abiertos.** Próximo norte: feedback real de jugadores en `tanda2026.com.ar`.

> Bonus opcional (no bloquea): knip en CI como guard de código muerto. Regenerar `database.types.ts`
> con `gen types` real algún día (hoy está curado a mano y al día; `gen types` lo regresaría a genérico).

Verde de referencia: `typecheck` · `lint` · `build` · **106 unit** + **52 db**.
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

16 fixes de gameplay/UI + cierre de los 2 pendientes del TODO. DB: migración `20260618120000_session_fixes`
(lead-in de ronda para ver grupos/bracket antes del 1er penal con 10s plenos; `get_penalty_result` para
rehidratar resultado perdido; segunda chance que le quita a CADA jugador su propia opción; history con
datos del partido final), aplicada a prod por MCP + **ledger reconciliado a los 4 archivos canónicos**
(baseline_schema + wiring + seed + session_fixes) + advisors sin alertas nuevas. Front: lobby sin
parpadeo, redirect por origen tras guardar avatar, pelo de avatares pegado, warning THREE.Clock
silenciado, texto del penal legible sobre el arco, bracket = árbol completo con cartel de rival y grupo
en su fase, victoria/historial/stats pulidos, crédito Pyrux+JM10 en la landing. Detalle en el git log.

Sesión previa: limpieza de docs + código/deps muertos (knip: −`@react-three/drei`), paralelización de
queries en server pages, metadatos de lanzamiento (OG/SEO) + PWA, consolidación de migraciones (45 → 3),
tipado del cliente (`Database` a mano en `lib/supabase/database.types.ts`).

> Bonus opcional (no bloquea): knip en CI como guard de código muerto.

> Protocolo: una cosa a la vez, verificar con output real, commit descriptivo. Cambios de
> arquitectura grandes → consultar a Gino primero.
