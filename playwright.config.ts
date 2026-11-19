import { defineConfig, devices } from "@playwright/test";

/**
 * Smoke e2e + accesibilidad (Fase 7). Corre contra el build de producción local (`pnpm start`).
 * Usa el Chrome del sistema (`channel: "chrome"`) → no baja navegadores. Solo páginas públicas:
 * no crea usuarios (el `.env.local` apunta a la DB de prod).
 */
export default defineConfig({
  testDir: "e2e",
  // El flujo de juego crea usuarios: solo con `pnpm test:e2e:flow` (Supabase local).
  testIgnore: ["flow/**", "shots/**"],
  timeout: 30_000,
  retries: 0,
  reporter: "list",
  use: { baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3100", channel: "chrome" },
  projects: [
    { name: "mobile", use: { ...devices["Pixel 7"], channel: "chrome" } },
    { name: "desktop", use: { ...devices["Desktop Chrome"], channel: "chrome" } },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : { command: "pnpm start -p 3100", url: "http://localhost:3100", reuseExistingServer: true, timeout: 60_000 },
});
