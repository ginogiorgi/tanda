import { expect, test } from "@playwright/test";
import { assertLocalSupabase, enterAsGuest, openPlay } from "../flow/_helpers";
import { shot } from "./_shot";

/** Menús: home, Cómo jugar, /jugar, globos de modo, perfil, cola ranked y sala de espera. */

test.beforeAll(assertLocalSupabase);

test("menús", async ({ page }) => {
  await enterAsGuest(page);
  await shot(page, "home");
  await shot(page, "home-full", { fullPage: true });

  await page.getByRole("button", { name: "Cómo jugar" }).click();
  await expect(page.getByRole("dialog", { name: "Cómo jugar" })).toBeVisible();
  await shot(page, "howto");
  await page.keyboard.press("Escape");

  await openPlay(page);
  await expect(page.getByRole("button", { name: "Crear sala" })).toBeVisible();
  await shot(page, "jugar");
  await shot(page, "jugar-full", { fullPage: true });
  for (const name of ["Mundial", "Ranked 1v1"]) {
    await page.getByRole("button", { name: `Cómo se juega ${name}` }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await shot(page, `help-${name.split(" ")[0]!.toLowerCase()}`);
    await page.keyboard.press("Escape");
  }

  await page.goto("/perfil");
  await expect(page.getByRole("heading", { level: 1, name: "Perfil" })).toBeVisible();
  await shot(page, "perfil");

  await page.goto("/jugar");
  await expect(page.getByRole("button", { name: "Crear sala" })).toBeVisible();
  await page.getByRole("button", { name: /^(?!cómo).*ranked 1v1/i }).click();
  await expect(page).toHaveURL(/\/ranked$/);
  await page.waitForTimeout(1500);
  await shot(page, "ranked-queue");
  await page.locator("[data-nav=back]").click();
  await expect(page).toHaveURL(/\/jugar$/);

  for (const mode of ["mundial", "fútbol argentino"]) {
    await page.getByRole("button", { name: "Crear sala" }).click();
    await page.getByRole("group", { name: /crear sala/i }).getByRole("button", { name: new RegExp(`^${mode}`, "i") }).click();
    await expect(page).toHaveURL(/\/sala\/[A-Z0-9]{6}$/, { timeout: 20_000 });
    await page.waitForTimeout(1000);
    await shot(page, `sala-${mode.split(" ")[0]!.normalize("NFD").replace(/\p{M}/gu, "")}`);
    await page.locator("[data-nav=back]").click();
    await expect(page.getByRole("button", { name: "Crear sala" })).toBeVisible();
  }
});
