import { expect, test } from "../_csp";
import type { Page } from "@playwright/test";
import { assertLocalSupabase, enterAsGuest, homePlay, openPlay } from "./_helpers";
import { visiblePrimaries } from "../_primary";

/**
 * Navegación y layout (feedback 14/11): "no hay botones para volver", "volver tarda un montón", "en
 * partida sacá el footer y que la pantalla quede fija". Mobile (Pixel 7), contra Supabase local.
 */

test.beforeAll(assertLocalSupabase);

/** La PÁGINA no scrollea (si algo no entra, scrollea su panel). */
async function pageIsFixed(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const el = document.scrollingElement ?? document.documentElement;
    return el.scrollHeight <= window.innerHeight + 1;
  });
}

/** Toca y mide hasta que la URL cambia y `ready` se ve (lo que percibe el usuario). */
async function timedNav(page: Page, tap: () => Promise<void>, url: RegExp, ready: () => Promise<void>): Promise<number> {
  const t0 = Date.now();
  await tap();
  await expect(page).toHaveURL(url);
  await ready();
  return Date.now() - t0;
}

test("app: perfil y tabla tienen volver al padre, rápido y sin footer", async ({ page }) => {
  await enterAsGuest(page);
  await expect(page.locator("footer")).toHaveCount(0);

  await page.goto("/ranking");
  const back = page.locator("[data-nav=back]");
  await expect(back).toBeVisible();
  expect(await pageIsFixed(page)).toBe(true);

  const toPerfil = await timedNav(page, () => back.click(), /\/perfil$/, async () => {
    await expect(page.getByRole("heading", { level: 1, name: "Perfil" })).toBeVisible();
  });
  const toHome = await timedNav(page, () => page.locator("[data-nav=back]").click(), /\/$/, async () => {
    await expect(homePlay(page)).toBeVisible();
  });
  console.log(`[nav] tabla→perfil ${toPerfil} ms · perfil→inicio ${toHome} ms`);
  // El header (layout) y el loading pintan al toque; el presupuesto fino lo mide la medición de prod.
  expect(toPerfil).toBeLessThan(1500);
  expect(toHome).toBeLessThan(1500);
});

test("juego: sala y cola ranked son pantalla fija, sin footer, y salir vuelve a Jugar sin esperar al server", async ({ page }) => {
  await enterAsGuest(page);
  await openPlay(page);

  // Sala (crear sala Mundial).
  await page.getByRole("button", { name: "Crear sala" }).click();
  await page.getByRole("group", { name: /crear sala/i }).getByRole("button", { name: /mundial/i }).click();
  await expect(page).toHaveURL(/\/sala\/[A-Z0-9]{6}$/, { timeout: 20_000 });
  await expect(page.locator("footer")).toHaveCount(0);
  expect(await pageIsFixed(page)).toBe(true);
  expect((await visiblePrimaries(page)).length).toBeLessThanOrEqual(1);
  const salir = await timedNav(page, () => page.locator("[data-nav=back]").click(), /\/jugar$/, async () => {
    await expect(page.getByRole("button", { name: /ranked 1v1/i })).toBeVisible();
  });

  // Cola ranked: sin "Tabla", sin footer, Cancelar en el header.
  await page.getByRole("button", { name: /ranked 1v1/i }).click();
  await expect(page).toHaveURL(/\/ranked$/);
  await expect(page.getByText(/Buscando/).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Tabla" })).toHaveCount(0);
  await expect(page.locator("footer")).toHaveCount(0);
  expect(await pageIsFixed(page)).toBe(true);
  const cancelar = await timedNav(page, () => page.locator("[data-nav=back]").click(), /\/jugar$/, async () => {
    await expect(page.getByRole("button", { name: /ranked 1v1/i })).toBeVisible();
  });
  console.log(`[nav] salir de sala ${salir} ms · cancelar cola ${cancelar} ms`);
  expect(salir).toBeLessThan(1500);
  expect(cancelar).toBeLessThan(1500);
});

test("información: home con una sola acción, Jugar con los caminos, perfil con posición y tabla", async ({ page }) => {
  await enterAsGuest(page);

  await test.step("home: sin volanta, sin sello, sin código ni Tabla; JUGAR es la única principal", async () => {
    await expect(page.getByText("Mundial · Fútbol argentino · En vivo")).toHaveCount(0);
    await expect(page.getByText("TA", { exact: false }).filter({ hasText: /^TA\s*26$/ })).toHaveCount(0);
    await expect(page.getByPlaceholder("CÓDIGO")).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Tabla" })).toHaveCount(0);
    expect(await visiblePrimaries(page)).toEqual(["Jugar"]);
  });

  await test.step("jugar: partida rápida, ranked, crear sala y código; volver a la home", async () => {
    await openPlay(page);
    const quick = page.getByRole("group", { name: /elegí el modo para jugar/i });
    await expect(quick.getByRole("button", { name: /mundial/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /ranked 1v1/i })).toBeVisible();
    await expect(page.getByRole("button", { name: "Crear sala" })).toBeVisible();
    await expect(page.getByPlaceholder("CÓDIGO")).toBeVisible();
    expect((await visiblePrimaries(page)).length).toBeLessThanOrEqual(1);
    await page.locator("[data-nav=back]").click();
    await expect(homePlay(page)).toBeVisible();
  });

  await test.step("perfil: posición en la liga + Ver tabla (la tabla cuelga del perfil)", async () => {
    await page.getByRole("link", { name: "Perfil", exact: true }).click();
    await expect(page).toHaveURL(/\/perfil$/);
    await expect(page.getByTestId("ranked-position")).toBeVisible();
    expect((await visiblePrimaries(page)).length).toBeLessThanOrEqual(1);
    await page.getByRole("link", { name: "Ver tabla" }).click();
    await expect(page).toHaveURL(/\/ranking$/);
    expect((await visiblePrimaries(page)).length).toBeLessThanOrEqual(1);
  });
});
