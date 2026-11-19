# Tanda ⚽

Juego de trivia sobre Mundiales de Fútbol, **multijugador y en tiempo real**. Cada
pregunta es un penal: dos jugadores responden la misma pregunta a la vez y el que responde
**bien y más rápido** mete el gol o ataja. Replica el formato del Mundial 2026 (48
selecciones) hasta coronar un campeón.

## Stack

Next.js 16 (App Router) · React 19 · TypeScript estricto · Tailwind v4 · Supabase
(Postgres, Auth, Realtime, RLS, pg_cron). La lógica autoritativa del juego corre en
**RPC plpgsql `SECURITY DEFINER`** (no hay Edge Functions). Vercel · Vitest.

## Comandos

```bash
pnpm dev        # desarrollo
pnpm build      # build de producción
pnpm start      # servir el build
pnpm lint       # ESLint
pnpm typecheck  # tsc --noEmit
pnpm test       # Vitest unit (motor de juego y de torneo)

# Suite del camino autoritativo SQL/RPC (necesita Docker):
pnpm db:start   # levanta Postgres local de Supabase
pnpm db:reset   # aplica supabase/migrations/ de cero
pnpm test:db    # Vitest contra la DB local
```

## Setup

1. `pnpm install`
2. Copiá `.env.example` a `.env.local` y completá las claves de Supabase.
3. `pnpm dev` → http://localhost:3000

## Documentación

- **`docs/BRIEF.md`** — diseño del producto y reglas del juego.
- **`SPEC.md`** — arquitectura, modelo de datos, máquinas de estado, contratos.
- **`TODO.md`** — plan en curso + cómo correr/deployar.
- **`CLAUDE.md`** — convenciones y gotchas (timing/RLS/anti-trampa).
- **`supabase/migrations/`** — esquema y RPCs de la DB: **la fuente de verdad** (la base
  de prod se construye replayeando estos archivos; ver `supabase/README.md`).
