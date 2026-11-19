import { test } from "./_csp";
import { assertLayout, VIEWPORTS } from "./_layout";

/**
 * Layout de las páginas públicas en 4 viewports (feedback 2, P4): la página scrollea el documento, el
 * footer está en todas y aparece recién al scrollear, nada fijo de más y sin scroll horizontal. Las
 * pantallas logueadas y de juego se chequean igual en el flow (Supabase local).
 */
const PAGES = ["/", "/login", "/register", "/forgot", "/no-existe"];

for (const vp of VIEWPORTS) {
  test.describe(vp.name, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } });
    for (const path of PAGES) {
      test(`${path}`, async ({ page }, info) => {
        test.skip(info.project.name !== "desktop", "los viewports los fija el spec; alcanza con un project");
        await page.goto(path);
        await assertLayout(page);
      });
    }
  });
}

// Feedback 3 #10: en PC la home entra sin scroll y con el footer al pie (también en 1366×768).
for (const vp of [{ width: 1440, height: 900 }, { width: 1366, height: 768 }]) {
  test(`home sin scroll en ${vp.width}x${vp.height}`, async ({ page }, info) => {
    test.skip(info.project.name !== "desktop", "un solo project");
    await page.setViewportSize(vp);
    await page.goto("/");
    await assertLayout(page, { fits: true });
  });
}
