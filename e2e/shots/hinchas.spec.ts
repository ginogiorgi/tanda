import { expect, test } from "@playwright/test";
import { assertLocalSupabase, pickFavorites } from "../flow/_helpers";
import { shot } from "./_shot";

/** Ranking de hinchas (feedback 3 #15): registro con favoritos, selector abierto, /hinchas, sala con tu país y feedback. */

test.beforeAll(assertLocalSupabase);

test("hinchas", async ({ page }, info) => {
  const username = `sh_${info.project.name}_${Date.now().toString(36)}`.slice(0, 20);
  await page.goto("/register");
  await page.getByLabel("Usuario").fill(username);
  await page.getByLabel("Contraseña").fill("tanda-test-123");
  await page.getByTestId("fav-club").click();
  await expect(page.getByTestId("fav-sheet-club")).toBeVisible();
  await page.waitForTimeout(400);
  await shot(page, "fav-picker");
  await page.keyboard.press("Escape");
  await pickFavorites(page, "Boca Juniors", "Argentina");
  await shot(page, "register-favs", { fullPage: true });
  await page.getByRole("button", { name: "Crear cuenta" }).click();
  await page.waitForURL(/\/avatar\?from=signup/, { timeout: 30_000 });

  await page.goto("/");
  await shot(page, "home-registrado");
  await page.goto("/hinchas");
  await expect(page.getByRole("heading", { name: "Países" })).toBeVisible();
  await shot(page, "hinchas");
  await shot(page, "hinchas-full", { fullPage: true });

  await page.getByTestId("feedback-button").click();
  await page.waitForTimeout(500);
  await shot(page, "feedback-sheet");
  await page.keyboard.press("Escape");

  await page.goto("/jugar");
  await page.getByRole("button", { name: "Crear sala" }).click();
  await page.getByRole("group", { name: /crear sala/i }).getByRole("button", { name: /^fútbol argentino/i }).click();
  await expect(page).toHaveURL(/\/sala\/[A-Z0-9]{6}$/, { timeout: 20_000 });
  await expect(page.getByTitle("Hincha de Boca Juniors")).toBeVisible({ timeout: 15_000 });
  await shot(page, "sala-fav");
  await page.locator("[data-nav=back]").click();
});
