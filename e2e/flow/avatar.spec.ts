import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "../_csp";
import { assertLocalSupabase } from "./_helpers";

/**
 * Creador de avatar (feedback 2, P7d): registro → punto de partida → Pelo (cámara a la cabeza) → Botines
 * (cámara a los pies) → sin Deshacer (feedback 3 #4) → Guardar → al volver, persiste. Más axe.
 */

test.beforeAll(assertLocalSupabase);

test("registro → preset → pelo y botines con cámara por pestaña → guardar → persiste", async ({ page }) => {
  const username = `av_${Date.now().toString(36)}`;
  await page.goto("/register");
  await page.getByLabel("Usuario").fill(username);
  await page.getByLabel("Contraseña").fill("tanda-test-123");
  await page.getByRole("button", { name: "Crear cuenta" }).click();
  await page.waitForURL(/\/avatar\?from=signup/, { timeout: 30_000 });

  const stage = page.getByTestId("avatar-stage");
  await expect(stage).toHaveAttribute("data-focus", "body");
  await expect(page.locator("canvas")).toHaveCount(1, { timeout: 30_000 });

  const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  expect(axe.violations.filter((v) => v.impact === "serious" || v.impact === "critical")).toEqual([]);

  await page.getByRole("button", { name: /la 10/i }).click();

  await page.getByRole("tab", { name: "Pelo" }).click();
  await expect(stage).toHaveAttribute("data-focus", "head");
  await page.getByRole("button", { name: "Rodete" }).click();
  await page.getByRole("button", { name: "Rubio", exact: true }).click();
  await expect(page.getByRole("button", { name: "Rodete" })).toHaveAttribute("aria-pressed", "true");

  await page.getByRole("tab", { name: "Botines" }).click();
  await expect(stage).toHaveAttribute("data-focus", "feet");
  await page.getByRole("button", { name: "Mostaza" }).click();
  await expect(page.getByRole("button", { name: "Mostaza" })).toHaveAttribute("aria-pressed", "true");

  // Feedback 3 #4: Aleatorio queda solo, sin Deshacer.
  await expect(page.getByRole("button", { name: "Aleatorio" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Deshacer" })).toHaveCount(0);

  await page.getByRole("button", { name: "Guardar jugador" }).click();
  await page.waitForURL((u) => u.pathname === "/", { timeout: 30_000 });

  await page.goto("/avatar");
  await page.getByRole("tab", { name: "Pelo" }).click();
  await expect(page.getByRole("button", { name: "Rodete" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "Rubio", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("tab", { name: "Botines" }).click();
  await expect(page.getByRole("button", { name: "Mostaza" })).toHaveAttribute("aria-pressed", "true");
  // Sin `from=signup` no ofrece los puntos de partida.
  await expect(page.getByText(/elegí un punto de partida/i)).toHaveCount(0);

  // Galería del creador para revisión manual (`QA_SHOTS=1`): cada pestaña en 360 y 1440.
  if (process.env.QA_SHOTS) {
    for (const vp of [{ width: 360, height: 780 }, { width: 1440, height: 900 }]) {
      await page.setViewportSize(vp);
      for (const tab of ["Cuerpo", "Piel", "Pelo", "Equipo", "Botines"]) {
        await page.getByRole("tab", { name: tab }).click();
        await page.waitForTimeout(900); // lerp de cámara
        await page.screenshot({ path: `artifacts/avatar-qa/creator/${vp.width}-${tab}.png`, fullPage: true });
      }
    }
  }
});
