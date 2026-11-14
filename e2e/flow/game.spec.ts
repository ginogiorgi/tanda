import { expect, test } from "../_csp";
import { assertLocalSupabase, enterAsGuest } from "./_helpers";

/**
 * Flujo de juego completo como invitado: sesión anónima → Jugar (Mundial) → sala → lobby (1 min
 * real) → partido → responder un penal → resolución (GOL/ATAJADO). Además verifica la regla de oro:
 * `correct_index` no viaja al cliente (REST ni Realtime) mientras el penal está abierto.
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

  await test.step("Jugar → Mundial → sala", async () => {
    await page.getByRole("button", { name: "Jugar", exact: true }).click();
    await page.getByRole("group", { name: /elegí el modo para jugar/i }).getByRole("button", { name: /mundial/i }).click();
    await expect(page).toHaveURL(/\/sala\/[A-Z0-9]+$/, { timeout: 20_000 });
  });

  await test.step("lobby → partido (el server arma el torneo con bots)", async () => {
    await expect(page).toHaveURL(/\/partido$/, { timeout: 120_000 });
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
