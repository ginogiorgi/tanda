import { expect, test } from "../_csp";
import { assertLocalSupabase, enterAsGuest, openPlay } from "./_helpers";

/**
 * Flujo de juego completo como invitado: sesión anónima → Jugar (Mundial) → sala → lobby (1 min
 * real) → partido → responder un penal → resolución (GOL/ATAJADO). Además verifica la regla de oro:
 * `correct_index` no viaja al cliente (REST ni Realtime) mientras el penal está abierto. Y que el 3D
 * nunca muestra otro muñeco: placeholder → error con reintento → escena.
 */

test.beforeAll(assertLocalSupabase);

test("invitado → sala → partido → penal resuelto", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  // Todo lo que llega del server mientras el penal está abierto (hasta responder).
  const payloads: string[] = [];
  let collecting = true;
  page.on("response", async (r) => {
    if (!collecting || !/\/(rest|realtime)\/v1\//.test(r.url())) return;
    try {
      payloads.push(`${r.url()} ${await r.text()}`);
    } catch {
      // cuerpo no disponible (redirect/preflight)
    }
  });
  page.on("websocket", (ws) => {
    ws.on("framereceived", (f) => {
      if (collecting) payloads.push(`ws ${typeof f.payload === "string" ? f.payload : f.payload.toString()}`);
    });
  });

  await test.step("entra como invitado", async () => {
    await enterAsGuest(page);
  });

  // P2.1 (feedback 2): sin muñeco de reemplazo. (Antes de la sala: la precarga de ahí también falla.) Los GLB tardan y después fallan → placeholder neutro,
  // después error con "Reintentar"; al reintentar con la red bien, recién ahí aparece la escena 3D.
  const glb = "**/models/avatar/*.glb";
  await page.route(glb, async (route) => {
    await new Promise((r) => setTimeout(r, 2_500));
    await route.abort();
  });

  await test.step("Jugar → Mundial → sala", async () => {
    await openPlay(page);
    await page.getByRole("group", { name: /elegí el modo para jugar/i }).getByRole("button", { name: /mundial/i }).click();
    await expect(page).toHaveURL(/\/sala\/[A-Z0-9]+$/, { timeout: 20_000 });
  });

  await test.step("lobby → partido (el server arma el torneo con bots)", async () => {
    await expect(page).toHaveURL(/\/partido$/, { timeout: 120_000 });
  });

  await test.step("3D: placeholder mientras carga, error claro si falla, escena al reintentar", async () => {
    await expect(page.getByTestId("scene-skeleton").first()).toBeVisible({ timeout: 30_000 });
    await expect(page.locator("canvas")).toHaveCount(0);
    await expect(page.getByTestId("scene-error")).toBeVisible({ timeout: 15_000 });
    await expect(page.locator("canvas")).toHaveCount(0);
    await page.unroute(glb);
    await page.getByTestId("scene-error").getByRole("button", { name: "Reintentar" }).click();
    await expect(page.locator("canvas")).toHaveCount(1, { timeout: 15_000 });
    await expect(page.getByTestId("scene-skeleton")).toHaveCount(0);
  });

  await test.step("responde el primer penal", async () => {
    const options = page.locator("button[aria-pressed]");
    await expect(options.first()).toBeEnabled({ timeout: 90_000 });
    // Con el penal abierto y antes de responder: la correcta no viajó al cliente.
    collecting = false;
    expect(payloads.length).toBeGreaterThan(0);
    expect(payloads.filter((p) => p.includes("correct_index"))).toEqual([]);
    await options.first().click();
    await expect(page.getByText(/respondiste a los/i)).toBeVisible();
    await expect(options.first()).toBeDisabled();
  });

  await test.step("resolución a los 10s", async () => {
    await expect(page.getByText(/¡GOL!|ATAJADO/)).toBeVisible({ timeout: 30_000 });
  });

  expect(errors).toEqual([]);
});
