import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "../_csp";
import { assertLocalSupabase, enterAsGuest } from "./_helpers";
import { visiblePrimaries } from "../_primary";

/**
 * Ayuda dentro de la app (feedback 2, P6): "Cómo jugar" en la home (hoja con <dialog>) y un "?" por
 * card en /jugar. Abre/cierra con Esc y tocando afuera, el foco vuelve al disparador y axe pasa con
 * la hoja abierta.
 */

test.beforeAll(assertLocalSupabase);

test("home: Cómo jugar abre la hoja; Esc / tap afuera cierran y el foco vuelve", async ({ page }) => {
  await enterAsGuest(page);
  await page.goto("/");
  expect(await visiblePrimaries(page)).toHaveLength(1);

  const trigger = page.getByRole("button", { name: "Cómo jugar" });
  const sheet = page.getByRole("dialog", { name: "Cómo jugar" });
  await trigger.click();
  await expect(sheet).toBeVisible();
  await expect(sheet).toContainText("Cada pregunta es un penal");
  await expect(sheet).toContainText("10 segundos");

  const axe = await new AxeBuilder({ page }).include("dialog[open]").withTags(["wcag2a", "wcag2aa"]).analyze();
  expect(axe.violations.filter((v) => v.impact === "serious" || v.impact === "critical")).toEqual([]);

  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
  await expect(trigger).toBeFocused();

  // Tap afuera (esquina superior: en mobile la hoja está anclada abajo).
  await trigger.click();
  await expect(sheet).toBeVisible();
  await page.mouse.click(5, 5);
  await expect(sheet).toBeHidden();

  // "Entendido" también cierra.
  await trigger.click();
  await sheet.getByRole("button", { name: "Entendido" }).click();
  await expect(sheet).toBeHidden();
});

test("/jugar: un ? por forma de jugar (modos, ranked, con amigos)", async ({ page }) => {
  await enterAsGuest(page);
  await page.goto("/jugar");
  const helps = page.getByTestId("help-button");
  await expect(helps).toHaveCount(4);
  for (const name of ["Mundial", "Fútbol argentino", "Ranked 1v1", "Con amigos"]) {
    await expect(page.getByRole("button", { name: `Cómo se juega ${name}` })).toBeVisible();
  }
  await page.getByRole("button", { name: "Cómo se juega Mundial" }).click();
  const sheet = page.getByRole("dialog", { name: "Mundial" });
  await expect(sheet).toContainText("48 selecciones");
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
  // Abrir la ayuda no arrancó una partida.
  await expect(page).toHaveURL(/\/jugar$/);
});
