import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "../_csp";
import { assertLayout } from "../_layout";
import { assertLocalSupabase, enterAsGuest, openPlay, pickFavorites } from "./_helpers";

/**
 * Ranking de hinchas (feedback 3 #15): el registro exige favoritos; /hinchas los muestra marcados y los
 * cambia al toque; el invitado ve el ranking con la invitación a crear cuenta; en la sala del Mundial tu
 * país aparece al lado de tu nombre y (solo en la sala) te toca jugar con él.
 */
test.beforeAll(assertLocalSupabase);

async function register(page: import("@playwright/test").Page, club: string, nation: string): Promise<string> {
  const username = `hi_${Date.now().toString(36)}`;
  await page.goto("/register");
  await page.getByLabel("Usuario").fill(username);
  await page.getByLabel("Contraseña").fill("tanda-test-123");
  await page.getByRole("button", { name: "Crear cuenta" }).click();
  await expect(page.getByText("Elegí tu club y tu país favoritos.")).toBeVisible(); // obligatorio
  await pickFavorites(page, club, nation);
  await page.getByRole("button", { name: "Crear cuenta" }).click();
  await page.waitForURL(/\/avatar\?from=signup/, { timeout: 30_000 });
  return username;
}

test("registro con favoritos → /hinchas marcado → cambio inmediato", async ({ page }) => {
  await register(page, "River Plate", "Uruguay");

  await page.goto("/");
  const buttons = page.locator("main a, main button").filter({
    hasText: /^(Cómo jugar|Ranking de hinchas|Ranking de jugadores|Mi perfil)$/,
  });
  await expect(buttons).toHaveText(["Cómo jugar", "Ranking de hinchas", "Ranking de jugadores", "Mi perfil"]);
  await page.getByRole("link", { name: "Ranking de hinchas" }).click();
  await expect(page).toHaveURL(/\/hinchas$/);
  await assertLayout(page);

  const clubs = page.getByRole("heading", { name: "Clubes" }).locator("..");
  const nations = page.getByRole("heading", { name: "Países" }).locator("..");
  await expect(clubs.locator("li[aria-current=true]")).toContainText("River Plate");
  await expect(nations.locator("li[aria-current=true]")).toContainText("Uruguay");
  await expect(nations.locator("li[aria-current=true]")).toContainText(/[1-9]\d* hincha/);
  const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  expect(axe.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => v.id)).toEqual([]);

  await pickFavorites(page, "Boca Juniors", "Uruguay");
  await expect(page.getByText("Listo, ya sumás para tus favoritos.")).toBeVisible();
  await page.reload();
  await expect(clubs.locator("li[aria-current=true]")).toContainText("Boca Juniors");
  await expect(page.getByTestId("fav-club")).toContainText("Boca Juniors");
});

test("invitado: ve el ranking y la invitación a crear cuenta", async ({ page }) => {
  await enterAsGuest(page);
  await page.getByRole("link", { name: "Ranking de hinchas" }).click();
  await expect(page.getByRole("heading", { name: "Países" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Pasar a cuenta" })).toBeVisible();
  await expect(page.getByTestId("fav-club")).toHaveCount(0);
});

test("sala del Mundial: tu país al lado del nombre y te toca jugar con él", async ({ page }) => {
  test.setTimeout(180_000);
  await register(page, "Racing Club", "Japón");
  await page.goto("/");
  await openPlay(page);
  await page.getByRole("group", { name: /elegí el modo para jugar/i }).getByRole("button", { name: /^mundial/i }).click();
  await expect(page).toHaveURL(/\/sala\/[A-Z0-9]+$/, { timeout: 20_000 });
  await expect(page.getByTitle("Hincha de Japón")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("img", { name: "Bandera de Japón" })).toBeVisible();
  await expect(page).toHaveURL(/\/partido$/, { timeout: 120_000 });
  await expect(page.getByText("Japón").first()).toBeVisible({ timeout: 30_000 });
});
