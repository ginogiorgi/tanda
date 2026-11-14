import { defineConfig, devices } from "@playwright/test";

/**
 * E2E del flujo de juego (invitado → sala → partido) contra el Supabase LOCAL. Se corre SOLO con
 * `pnpm test:e2e:flow` (`scripts/e2e/flow.sh`), que construye la app apuntando a la DB local y
 * aborta si no es local. La sala espera su minuto real de lobby → test largo.
 */
// Puerto configurable: dos worktrees pueden correr el flujo a la vez (cada uno con su stack local,
// `SUPABASE_WORKDIR`). Default 3101.
const PORT = Number(process.env.E2E_FLOW_PORT ?? 3101);

export default defineConfig({
  testDir: "e2e/flow",
  timeout: 240_000,
  retries: 0,
  workers: 1,
  reporter: "list",
  use: { baseURL: `http://localhost:${PORT}`, channel: "chrome", trace: "retain-on-failure" },
  projects: [{ name: "mobile", use: { ...devices["Pixel 7"], channel: "chrome" } }],
  webServer: { command: `pnpm start -p ${PORT}`, url: `http://localhost:${PORT}`, reuseExistingServer: false, timeout: 60_000 },
});
