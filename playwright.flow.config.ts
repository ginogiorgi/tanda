import { defineConfig, devices } from "@playwright/test";

/**
 * E2E del flujo de juego (invitado → sala → partido) contra el Supabase LOCAL. Se corre SOLO con
 * `pnpm test:e2e:flow` (`scripts/e2e/flow.sh`), que construye la app apuntando a la DB local y
 * aborta si no es local. La sala espera su minuto real de lobby → test largo.
 */
export default defineConfig({
  testDir: "e2e/flow",
  timeout: 240_000,
  retries: 0,
  workers: 1,
  reporter: "list",
  use: { baseURL: "http://localhost:3101", channel: "chrome", trace: "retain-on-failure" },
  projects: [{ name: "mobile", use: { ...devices["Pixel 7"], channel: "chrome" } }],
  webServer: { command: "pnpm start -p 3101", url: "http://localhost:3101", reuseExistingServer: false, timeout: 60_000 },
});
