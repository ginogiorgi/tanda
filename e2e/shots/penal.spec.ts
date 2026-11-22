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

/**
 * Feedback 4 #11: transparencia del cartel de resultado sobre la escena (papel sin blur). `default` = la de
 * producción; el resto, variantes para comparar. Gol y atajada congelados con el arquero ya jugado.
 */
const CARDS = (process.env.SHOTS_CARD ?? "default,70,80,88,100").split(",");
for (const s of ["goal-0", "save-3"]) {
  test(`penal: cartel sobre ${s}`, async ({ page }) => {
    for (const c of CARDS) {
      await page.goto(devUrl(`/dev/penal?shot=${s}&t=2.0&card=${c}`));
      await expect(page.locator("canvas")).toHaveCount(1, { timeout: 60_000 });
      await expect(page.getByTestId("penal-result-card")).toBeVisible();
      await page.waitForTimeout(2000);
      await shot(page, `cartel-${s}-${c}`);
    }
  });
}

/**
 * Feedback 4 #16: los cinco festejos del gol con la cámara del juego, desde que arranca la reacción
 * (`REACTION_AT` 1,6 s) hasta que aparece el próximo penal (~4 s). `SHOTS_CEL=siu,slide` filtra.
 */
const CELS = (process.env.SHOTS_CEL ?? "siu,sky,crossed,cradle,slide").split(",");
const CEL_TIMES = ["1.6", "2.0", "2.4", "2.8", "3.2", "4.0"];
for (const c of CELS) {
  test(`penal: festejo ${c}`, async ({ page }) => {
    for (const t of CEL_TIMES) {
      await page.goto(devUrl(`/dev/penal?shot=goal-1&celebration=${c}&t=${t}`));
      await expect(page.locator("canvas")).toHaveCount(1, { timeout: 60_000 });
      await page.waitForTimeout(2000);
      await shot(page, `festejo-${c}-t${t}`);
    }
  });
}
