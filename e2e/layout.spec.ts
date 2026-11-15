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
