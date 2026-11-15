import { expect, type Page } from "@playwright/test";

/**
 * Regla única de layout (feedback 2, P4 — docs/DESIGN-RULES.md §Layout), verificada en el DOM real:
 *  1. hay footer (uno), en todas las pantallas, juego incluido;
 *  2. el footer NO se ve al cargar (el contenido ocupa al menos el viewport);
 *  3. se llega al footer scrolleando el documento;
 *  4. nada fijo/sticky fuera de lo permitido (`data-layer` bg|overlay|header) — ni tapando contenido;
 *  5. sin scroll horizontal de página;
 *  6. en juego, el `GameStage` mide el viewport (menos el header si lo hay) y nada desborda adentro
 *     (salvo la tarjeta del penal, que tiene su propio `max-h` + scroll).
 */
export const VIEWPORTS = [
  { name: "360x640", width: 360, height: 640 },
  { name: "430x932", width: 430, height: 932 },
  { name: "820x1180", width: 820, height: 1180 },
  { name: "1440x900", width: 1440, height: 900 },
] as const;

export async function assertLayout(page: Page, opts: { stage?: boolean } = {}): Promise<void> {
  await expect(page.locator("footer")).toHaveCount(1);
  await page.evaluate(() => window.scrollTo(0, 0));

  const m = await page.evaluate(() => {
    const footer = document.querySelector("footer")!;
    const allowed = new Set(["bg", "overlay", "header"]);
    const strayFixed: string[] = [];
    for (const el of document.body.querySelectorAll<HTMLElement>("*")) {
      const pos = getComputedStyle(el).position;
      if (pos !== "fixed" && pos !== "sticky") continue;
      // Un elemento permitido habilita a sus descendientes (el header sticky contiene botones, etc.).
      const layer = el.closest<HTMLElement>("[data-layer]")?.dataset.layer;
      if (!layer || !allowed.has(layer)) strayFixed.push(`${el.tagName.toLowerCase()}.${el.className.toString().slice(0, 60)}`);
    }
    const stage = document.querySelector<HTMLElement>("[data-stage]");
    const header = document.querySelector<HTMLElement>("[data-layer=header]");
    const overflowing = stage
      ? [...stage.querySelectorAll<HTMLElement>("*")]
          .filter((el) => !el.closest("[data-layer=card]") && el.scrollHeight > el.clientHeight + 1)
          .filter((el) => ["auto", "scroll"].includes(getComputedStyle(el).overflowY))
          .map((el) => el.className.toString().slice(0, 60))
      : [];
    return {
      footerTop: footer.getBoundingClientRect().top,
      innerHeight: window.innerHeight,
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
      strayFixed,
      stageHeight: stage?.getBoundingClientRect().height ?? null,
      headerHeight: header && stage && header.compareDocumentPosition(stage) & Node.DOCUMENT_POSITION_FOLLOWING
        ? header.getBoundingClientRect().height
        : 0,
      overflowing,
    };
  });

  expect(m.footerTop, "el footer no se ve al cargar").toBeGreaterThanOrEqual(m.innerHeight - 1);
  expect(m.strayFixed, "nada fixed/sticky fuera de bg|overlay|header").toEqual([]);
  expect(m.scrollWidth, "sin scroll horizontal").toBeLessThanOrEqual(m.innerWidth);
  if (opts.stage) {
    expect(m.stageHeight, "hay GameStage").not.toBeNull();
    expect(Math.abs(m.stageHeight! - (m.innerHeight - m.headerHeight)), "el stage mide un viewport").toBeLessThanOrEqual(1);
    expect(m.overflowing, "nada desborda dentro del stage").toEqual([]);
  }

  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await expect(page.locator("footer")).toBeInViewport();
  await page.evaluate(() => window.scrollTo(0, 0));
}
