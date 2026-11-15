import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Alias `@/` → raíz del repo (igual que tsconfig paths), para los tests que importan código de app.
const alias = { "@": fileURLToPath(new URL(".", import.meta.url)) };

// Dos proyectos:
// - `unit`: el motor TS puro (lib/**). Rápido, sin red ni DB. Lo corre `pnpm test` y el CI base.
// - `db`:   el camino autoritativo SQL/RPC contra el Postgres local de Supabase (supabase/tests/**).
//           Requiere `pnpm db:start` + `pnpm db:reset`. Lo corre `pnpm test:db` y el job `db` de CI.
//           Serializado (sin paralelismo entre archivos) porque comparten la misma DB.
export default defineConfig({
  test: {
    projects: [
      {
        resolve: { alias },
        test: {
          name: "unit",
          include: ["lib/**/*.test.ts"],
          environment: "node",
        },
      },
      {
        resolve: { alias },
        test: {
          name: "db",
          include: ["supabase/tests/**/*.test.ts"],
          environment: "node",
          testTimeout: 60_000,
          hookTimeout: 60_000,
          // Archivos en serie (comparten la misma DB local). Vitest 5 sacó `poolOptions.forks.singleFork`.
          pool: "forks",
          fileParallelism: false,
        },
      },
    ],
  },
});
