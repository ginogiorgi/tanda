/**
 * Smoke de DEPLOY en prod (feedback 2): invitado → /jugar → Mundial → sala → primer penal, sin errores de
 * consola ni violaciones CSP, y con los GLB precargados en la sala. Crea un usuario anónimo real → solo
 * corre a pedido:  E2E_BASE_URL=https://tanda2026.com.ar E2E_PROD_GUEST=1 pnpm exec playwright test prod-guest
 */
import { expect, test } from "@playwright/test";

test.skip(!process.env.E2E_BASE_URL || !process.env.E2E_PROD_GUEST, "solo a pedido, contra prod");
test.setTimeout(180_000);

test("prod: invitado juega un penal sin errores ni violaciones CSP", async ({ page }, info) => {
  test.skip(info.project.name !== "mobile", "una vez alcanza");
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(String(e)));
  const glb: number[] = [];
  page.on("request", (r) => {
    if (/\/models\/avatar\/.+\.glb/.test(r.url())) glb.push(Date.now());
  });
  await page.addInitScript(() => {
    document.addEventListener("securitypolicyviolation", (e) =>
      console.error(`CSP ${e.violatedDirective} ${e.blockedURI}`),
    );
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Jugar como invitado" }).click();
  await page.getByRole("link", { name: "Jugar", exact: true }).click();
  await expect(page).toHaveURL(/\/jugar/);
  await page.getByRole("group", { name: "Elegí el modo para jugar" }).getByRole("button", { name: /^Mundial/ }).click();
  await expect(page).toHaveURL(/\/sala\//, { timeout: 20_000 });
  const inSala = Date.now();
  // P3: espera de sala de 30 s (puede ser menos si entró a una sala ya abierta).
  await expect(page.getByTestId("lobby-countdown")).toHaveText(/^0:(30|[0-2]\d)$/, { timeout: 10_000 });
  await expect.poll(() => glb.length, { timeout: 20_000 }).toBeGreaterThan(0);
  console.log(`[prod] GLB pedido a los ${glb[0]! - inSala} ms de entrar a la sala`);

  await expect(page).toHaveURL(/\/partido/, { timeout: 120_000 });
  const option = page.getByRole("button", { name: /^[ABC]\b/ }).first();
  await expect(option).toBeVisible({ timeout: 30_000 });
  await option.click();
  await expect(page.getByText(/¡GOL!|ATAJADO/)).toBeVisible({ timeout: 20_000 });
  expect(errors, errors.join("\n")).toEqual([]);
});
