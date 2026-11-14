import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const PAGES = [
  { path: "/", heading: /tanda/i },
  { path: "/login", heading: /entr|ingres|sesi/i },
  { path: "/register", heading: /cuenta|registr/i },
  { path: "/forgot", heading: /contraseña|clave/i },
  { path: "/ranking", heading: null },
  { path: "/una-ruta-que-no-existe", heading: null },
] as const;

for (const p of PAGES) {
  test(`${p.path} carga sin errores y pasa axe (serious/critical)`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(p.path);
    await page.waitForLoadState("networkidle");
    if (p.heading) await expect(page.getByRole("heading").first()).toBeVisible();
    // Sin scroll horizontal (mobile first).
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
    const bad = axe.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(bad.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
    expect(errors).toEqual([]);
  });
}

test("metadatos SEO y OG en la landing", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/tanda/i);
  expect(await page.locator('meta[name="description"]').getAttribute("content")).toBeTruthy();
  expect(await page.locator('meta[property="og:image"]').first().getAttribute("content")).toBeTruthy();
  const sitemap = await page.request.get("/sitemap.xml");
  expect(sitemap.ok()).toBe(true);
  const robots = await page.request.get("/robots.txt");
  expect(await robots.text()).toMatch(/sitemap/i);
});
