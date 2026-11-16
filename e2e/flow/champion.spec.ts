import { expect, test } from "../_csp";
import { answerCorrectUntil, assertLocalSupabase, enterAsGuest, homePlay, openPlay } from "./_helpers";

/**
 * Torneo completo del invitado hasta el campeón: Mundial → lobby → 3 de grupos → 16avos … final,
 * acertando cada penal al toque (los bots tardan ≥4 s → gana todos los duelos). Verifica la
 * pantalla de campeón (RunSummary), el bracket coronado y la copa de oro en las estadísticas del
 * perfil. ~10–15 min (cada penal se resuelve a los 10 s reales) → fuera de la corrida por defecto y
 * de CI: `E2E_SLOW=1 pnpm test:e2e:flow champion`.
 */

test.beforeAll(assertLocalSupabase);
test.skip(process.env.E2E_SLOW !== "1", "lento (~15 min): correr con E2E_SLOW=1");

test("invitado → torneo completo → campeón", async ({ page }) => {
  test.setTimeout(1_500_000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  await enterAsGuest(page);
  await openPlay(page);
  await page.getByRole("group", { name: /elegí el modo para jugar/i }).getByRole("button", { name: /^mundial/i }).click();
  await expect(page).toHaveURL(/\/sala\/[A-Z0-9]+$/, { timeout: 20_000 });
  await expect(page).toHaveURL(/\/partido$/, { timeout: 120_000 });

  let answered = 0;
  await test.step("juega todos los partidos acertando", async () => {
    answered = await answerCorrectUntil(page, /^¡Campeón!$/, 1_350_000);
  });
  // 8 partidos (3 de grupos + 5 de eliminación): el humano patea ≥2 por partido.
  expect(answered).toBeGreaterThanOrEqual(16);

  await test.step("resumen de campeón", async () => {
    await expect(page.getByText("¡Campeón!", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Jugar de nuevo" })).toBeVisible();
    await expect(page.getByRole("link", { name: /creá tu cuenta/i })).toBeVisible();
    // P5: acciones del mismo alto; torneo terminado → sin "Ver cómo sigue".
    const actions = page.getByTestId("result-actions");
    const play = await actions.getByRole("button", { name: "Jugar de nuevo" }).boundingBox();
    const home = await actions.getByRole("link", { name: "Volver al inicio" }).boundingBox();
    expect(play?.height).toBeGreaterThan(0);
    expect(home?.height).toBe(play?.height);
    await expect(actions.getByRole("button", { name: "Ver cómo sigue" })).toHaveCount(0);
  });

  await test.step("perfil: copa de oro del Mundial", async () => {
    await page.getByRole("link", { name: "Volver al inicio" }).click();
    await expect(homePlay(page)).toBeVisible({ timeout: 20_000 });
    await page.goto("/perfil");
    const gold = page.getByRole("listitem").filter({ hasText: "Campeón" }).first();
    await expect(gold).toContainText("1");
  });

  expect(errors).toEqual([]);
});
