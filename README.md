# Tanda ⚽

Juego de trivia sobre Mundiales de Fútbol, **multijugador y en tiempo real**. Cada
pregunta es un penal: dos jugadores responden la misma pregunta a la vez y el que responde
**bien y más rápido** mete el gol o ataja. Replica el formato del Mundial 2026 (48
selecciones) hasta coronar un campeón.

## Stack

Next.js 16 (App Router) · React 19 · TypeScript estricto · Tailwind v4 · Supabase
(Postgres, Auth, Realtime, Edge Functions, RLS) · Vercel · Vitest.

## Comandos

```bash
pnpm dev        # desarrollo
pnpm build      # build de producción
pnpm start      # servir el build
pnpm lint       # ESLint
pnpm typecheck  # tsc --noEmit
pnpm test       # Vitest (motor de juego y de torneo)
```

## Setup

1. `pnpm install`
2. Copiá `.env.example` a `.env.local` y completá las claves de Supabase.
3. `pnpm dev` → http://localhost:3000

## Documentación

- **`docs/BRIEF.md`** — diseño del producto (fuente de verdad).
- **`SPEC.md`** — arquitectura, modelo de datos, máquinas de estado, contratos.
- **`PLAN.md`** — fases de construcción.
- **`TODO.md`** — estado actual y tareas (leer primero al retomar).
- **`CLAUDE.md`** — comandos, convenciones y gotchas.
