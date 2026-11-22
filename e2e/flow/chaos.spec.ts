import type { WebSocketRoute } from "@playwright/test";
import { expect, test } from "../_csp";
import { assertLocalSupabase, enterAsGuest, openPlay } from "./_helpers";

/**
 * Caos (feedback 4 F): a mitad del cartel de un resultado se corta la red (REST offline + el socket de
 * Realtime deja de entregar y después se cae) durante más que el hueco entre penales → se pierde el
 * `penal:start` del próximo. Al volver la red el juego se recupera SOLO (resuscripción + rehidratación +
 * poll del padre + watchdog): aparece la pregunta del penal siguiente, sin pantalla de error ni recargar.
 */

test.beforeAll(assertLocalSupabase);

test("se corta la red a mitad del cartel y el partido sigue solo", async ({ page, context }) => {
  test.setTimeout(300_000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  // Proxy del socket de Realtime: deja pasar todo hasta que `blackout` se prende.
  let blackout = false;
  const sockets: WebSocketRoute[] = [];
  await page.routeWebSocket(/\/realtime\/v1\/websocket/, (ws) => {
    const server = ws.connectToServer();
    sockets.push(ws);
    ws.onMessage((m) => {
      if (!blackout) server.send(m);
    });
    server.onMessage((m) => {
      if (!blackout) ws.send(m);
    });
  });

  await enterAsGuest(page);
  await openPlay(page);
  await page.getByRole("group", { name: /elegí el modo para jugar/i }).getByRole("button", { name: /^mundial/i }).click();
  await expect(page).toHaveURL(/\/sala\/[A-Z0-9]+$/, { timeout: 20_000 });
  await expect(page).toHaveURL(/\/partido$/, { timeout: 120_000 });

  const options = page.locator("button[data-option]");
  await test.step("primer penal: responde y llega el cartel", async () => {
    await expect(options.first()).toBeEnabled({ timeout: 90_000 });
    await options.first().click();
    await expect(page.getByTestId("penal-result-card")).toBeVisible({ timeout: 30_000 });
  });

  await test.step("apagón de 9 s a mitad del cartel (más que el hueco entre penales)", async () => {
    blackout = true;
    await context.setOffline(true);
    await page.waitForTimeout(4_000);
    // El socket se cae del todo (como un corte de wifi largo): el canal pasa a CLOSED/CHANNEL_ERROR.
    for (const ws of sockets.splice(0)) await ws.close({ code: 4000, reason: "e2e: corte" }).catch(() => undefined);
    await page.waitForTimeout(5_000);
    await context.setOffline(false);
    blackout = false;
  });

  await test.step("vuelve la red: aparece el próximo penal sin recargar ni pantalla de error", async () => {
    await expect(options.first()).toBeEnabled({ timeout: 25_000 });
    await expect(page.getByTestId("penal-result-card")).toHaveCount(0);
    await expect(page.getByTestId("error-screen")).toHaveCount(0);
  });

  await test.step("y el penal se juega hasta el resultado", async () => {
    await options.first().click();
    await expect(page.getByTestId("penal-result-card")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("error-screen")).toHaveCount(0);
  });

  // Los errores de red del apagón son esperables; un error de JS no.
  expect(errors.filter((e) => !/fetch|network|websocket/i.test(e))).toEqual([]);
});
