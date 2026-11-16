import { expect, test } from "../_csp";
import { answerCorrectUntil, assertLocalSupabase, enterAsGuest, openPlay } from "./_helpers";

/**
 * P5 (feedback 2): derrota en eliminatoria. Gana los grupos acertando, en el primer partido de KO
 * erra a propósito → los CRUCES (bracket con la ronda nueva) aparecen ANTES del resumen; el resumen
 * ofrece "Ver cómo sigue" (torneo en juego) → espectador con la cinta → "Ver mi resultado" vuelve.
 * Lento (~6 min, penales de 10 s reales): `E2E_SLOW=1 pnpm test:e2e:flow ko-loss`.
 */

test.beforeAll(assertLocalSupabase);
test.skip(process.env.E2E_SLOW !== "1", "lento (~6 min): correr con E2E_SLOW=1");

test("invitado → pierde en KO → cruces → resumen → ver cómo sigue", async ({ page }) => {
  test.setTimeout(900_000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  await enterAsGuest(page);
  await openPlay(page);
  await page.getByRole("group", { name: /elegí el modo para jugar/i }).getByRole("button", { name: /^mundial/i }).click();
  await expect(page).toHaveURL(/\/partido$/, { timeout: 120_000 });

  await test.step("gana los grupos (hasta el primer penal de KO: 5 por lado)", async () => {
    await answerCorrectUntil(page, /Penal \d de 5/, 600_000);
  });

  const view = page.getByTestId("tournament-view");
  await test.step("erra todo en el KO → cruces antes del resumen", async () => {
    // Los cruces se ven primero (≥ 4 s, con la ronda siguiente ya armada) y DESPUÉS el resumen.
    const crossings = expect(view).toHaveAttribute("data-view", "crossings", { timeout: 300_000 });
    await answerCorrectUntil(page, /^Eliminado en /, 300_000, "wrong");
    await crossings;
  });

  await test.step("resumen: tres acciones del mismo alto → espectador → volver", async () => {
    const actions = page.getByTestId("result-actions");
    const spectate = actions.getByRole("button", { name: "Ver cómo sigue" });
    await expect(spectate).toBeVisible();
    const hs = await Promise.all(
      [actions.getByRole("button", { name: "Jugar de nuevo" }), spectate, actions.getByRole("link", { name: "Volver al inicio" })].map(
        async (l) => (await l.boundingBox())?.height,
      ),
    );
    expect(new Set(hs).size).toBe(1);
    await spectate.click();
    await expect(page.getByTestId("spectator-banner")).toContainText(/Estás mirando · quedaste afuera en/);
    await page.getByRole("button", { name: "Ver mi resultado" }).click();
    await expect(page.getByText(/^Eliminado en /)).toBeVisible();
  });

  expect(errors).toEqual([]);
});
