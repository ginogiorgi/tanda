import { expect, test } from "@playwright/test";
import { devUrl, shot } from "./_shot";

/**
 * Escena del penal cuadro a cuadro en `/dev/penal?shot=…&t=…` (congelada en t). Idle + 4 jugadas
 * (gol, atajada, afuera; alto y bajo) cada 0,2 s hasta 2,0 s. `SHOTS_PENAL=goal-1` filtra una jugada.
 */
const SHOTS = (process.env.SHOTS_PENAL ?? "goal-0,goal-3,save-0,save-3,miss_wide-1").split(",");
const TIMES = (process.env.SHOTS_T ?? "0.2,0.4,0.6,0.8,1.0,1.2,1.6,2.0").split(",");

test("penal: idle", async ({ page }) => {
  await page.goto(devUrl("/dev/penal"));
  await expect(page.locator("canvas")).toHaveCount(1, { timeout: 60_000 });
  await page.waitForTimeout(2500);
  await shot(page, "penal-idle");
});

for (const s of SHOTS) {
  test(`penal: ${s}`, async ({ page }) => {
    for (const t of TIMES) {
      await page.goto(devUrl(`/dev/penal?shot=${s}&t=${t}`));
      await expect(page.locator("canvas")).toHaveCount(1, { timeout: 60_000 });
      await page.waitForTimeout(2000);
      await shot(page, `penal-${s}-t${t}`);
    }
  });
}
