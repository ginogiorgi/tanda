import { expect, test } from "@playwright/test";
import { assertLocalSupabase, enterAsGuest, openPlay } from "../flow/_helpers";
import { shot } from "./_shot";

/**
 * Torneo: Argentino y Mundial en fase de zonas (presentación al entrar a /partido: tu próximo partido +
 * tablas). `SHOTS_MODE=arg` filtra un modo.
 */
test.beforeAll(assertLocalSupabase);

const MODES = (process.env.SHOTS_MODE ?? "arg,mundial").split(",");
const BUTTON: Record<string, RegExp> = { arg: /^(fútbol argentino|argentino)/i, mundial: /^mundial/i };

for (const mode of MODES) {
  test(`torneo ${mode}: fase de zonas`, async ({ page }) => {
    test.setTimeout(180_000);
    await enterAsGuest(page);
    await openPlay(page);
    await page.getByRole("group", { name: /elegí el modo para jugar/i }).getByRole("button", { name: BUTTON[mode]! }).click();
    await expect(page).toHaveURL(/\/partido$/, { timeout: 120_000 });
    await expect(page.getByTestId("zones-grid")).toBeVisible({ timeout: 30_000 });
    await shot(page, `torneo-${mode}-zonas`);
    await shot(page, `torneo-${mode}-zonas-full`, { fullPage: true });
  });
}
