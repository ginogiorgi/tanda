import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "../_csp";
import { assertLocalSupabase, enterAsGuest, homePlay } from "./_helpers";
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
  await expect(homePlay(page)).toBeVisible(); // contar recién con la home pintada (flake de CI: 0 primarias)
  expect(await visiblePrimaries(page)).toHaveLength(1);

  const trigger = page.getByRole("button", { name: "Cómo jugar" });
  const sheet = page.getByRole("dialog", { name: "Cómo jugar" });
  await trigger.click();
  await expect(sheet).toBeVisible();
  await expect(sheet).toContainText("Cada pregunta es un penal");
  await expect(sheet).toContainText("10 segundos");
  await expect(sheet).not.toContainText("Torneos y Ranked"); // feedback 3 #7

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

test("/jugar: un ? adentro de cada card de modo y de Ranked; nada en Con amigos", async ({ page }) => {
  await enterAsGuest(page);
  await page.goto("/jugar");
  const helps = page.getByTestId("help-button");
  await expect(helps).toHaveCount(3); // feedback 3 #8: fuera el "?" de "Con amigos"
  const cards: [string, RegExp][] = [
    ["Mundial", /^mundial/i],
    ["Fútbol argentino", /^fútbol argentino/i],
    ["Ranked 1v1", /^(?!cómo).*ranked 1v1/i],
  ];
  const quick = page.getByRole("group", { name: /elegí el modo para jugar/i });
  for (const [name, card] of cards) {
    const help = await page.getByRole("button", { name: `Cómo se juega ${name}` }).boundingBox();
    const box = await quick.getByRole("button", { name: card }).boundingBox();
    expect(help && box, name).toBeTruthy();
    // El "?" queda entero dentro de su tarjeta.
    expect(help!.x).toBeGreaterThanOrEqual(box!.x);
    expect(help!.y).toBeGreaterThanOrEqual(box!.y);
    expect(help!.x + help!.width).toBeLessThanOrEqual(box!.x + box!.width);
    expect(help!.y + help!.height).toBeLessThanOrEqual(box!.y + box!.height);
  }
  await page.getByRole("button", { name: "Cómo se juega Mundial" }).click();
  const sheet = page.getByRole("dialog", { name: "Mundial" });
  await expect(sheet).toContainText("48 selecciones");
  await expect(sheet).not.toContainText("Liga"); // feedback 3 #9: los torneos no aclaran la liga
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
  await page.getByRole("button", { name: "Cómo se juega Ranked 1v1" }).click();
  await expect(page.getByRole("dialog", { name: "Ranked 1v1" })).toContainText("Liga");
  await page.keyboard.press("Escape");
  // Abrir la ayuda no arrancó una partida.
  await expect(page).toHaveURL(/\/jugar$/);
});
