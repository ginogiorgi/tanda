import { defineConfig } from "vitest/config";

// Dos proyectos:
// - `unit`: el motor TS puro (lib/**). Rápido, sin red ni DB. Lo corre `pnpm test` y el CI base.
// - `db`:   el camino autoritativo SQL/RPC contra el Postgres local de Supabase (supabase/tests/**).
//           Requiere `pnpm db:start` + `pnpm db:reset`. Lo corre `pnpm test:db` y el job `db` de CI.
//           Serializado (un solo fork, sin paralelismo entre archivos) porque comparten la misma DB.
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "unit",
          include: ["lib/**/*.test.ts"],
          environment: "node",
        },
      },
      {
        test: {
          name: "db",
          include: ["supabase/tests/**/*.test.ts"],
          environment: "node",
          testTimeout: 60_000,
          hookTimeout: 60_000,
          // Un solo fork, archivos en serie: comparten la misma DB local.
          pool: "forks",
          poolOptions: { forks: { singleFork: true } },
        },
      },
    ],
  },
});
