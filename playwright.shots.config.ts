import { defineConfig, devices } from "@playwright/test";

/**
 * Capturas de revisión visual (feedback 3): cada spec de `e2e/shots/` deja PNG en `SHOTS_DIR` a 390×844
 * (dpr 2, touch) y 1440×900. Se corre con `bash scripts/e2e/shots.sh` contra el Supabase LOCAL (crea
 * usuarios). Dos servidores: el build de producción (pantallas reales) y `next dev` (bancos `/dev/*`,
 * que dan 404 en producción).
 */
const PORT = Number(process.env.E2E_FLOW_PORT ?? 3101);
const DEV_PORT = Number(process.env.SHOTS_DEV_PORT ?? 3102);
process.env.SHOTS_DEV_URL = `http://localhost:${DEV_PORT}`;

export default defineConfig({
  testDir: "e2e/shots",
  timeout: 300_000,
  retries: 0,
  workers: 1,
  reporter: "list",
  use: { baseURL: `http://localhost:${PORT}`, channel: "chrome" },
  projects: [
    { name: "390", use: { ...devices["iPhone 13"], defaultBrowserType: "chromium", channel: "chrome", viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 } },
    { name: "1440", use: { ...devices["Desktop Chrome"], channel: "chrome", viewport: { width: 1440, height: 900 } } },
  ],
  webServer: [
    { command: `pnpm start -p ${PORT}`, url: `http://localhost:${PORT}`, reuseExistingServer: true, timeout: 60_000 },
    { command: `pnpm exec next dev -p ${DEV_PORT}`, url: `http://localhost:${DEV_PORT}/dev/kit`, reuseExistingServer: true, timeout: 180_000 },
  ],
});
