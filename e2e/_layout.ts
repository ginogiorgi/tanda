import { expect, type Page } from "@playwright/test";

/**
 * Regla única de layout (docs/DESIGN-RULES.md §Layout; feedback 3 #10), verificada en el DOM real:
 *  1. hay footer (uno), en todas las pantallas, juego incluido;
 *  2. el footer es lo ÚLTIMO del documento y el documento mide al menos el viewport: si el contenido entra,
 *     no hay scroll y el footer se ve al pie; si no entra, se llega al footer scrolleando;
 *  3. nada fijo/sticky fuera de lo permitido (`data-layer` bg|overlay|header) — ni tapando contenido;
 *  4. sin scroll horizontal de página;
 *  5. en juego, el `GameStage`: en celu mide el viewport (menos el header); desde `md` ocupa el alto que
 *     deja el footer (≥ 34rem) — y nada desborda adentro (salvo la tarjeta del penal, con su `max-h`).
 *  `fits: true` exige además que la pantalla entre sin scroll (home y /jugar en PC).
 */
export const VIEWPORTS = [
  { name: "360x640", width: 360, height: 640 },
  { name: "430x932", width: 430, height: 932 },
  { name: "820x1180", width: 820, height: 1180 },
  { name: "1440x900", width: 1440, height: 900 },
] as const;

export async function assertLayout(page: Page, opts: { stage?: boolean; fits?: boolean } = {}): Promise<void> {
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
    const fr = footer.getBoundingClientRect();
    return {
      footerTop: fr.top,
      footerBottom: fr.bottom + window.scrollY,
      footerHeight: fr.height,
      docHeight: document.documentElement.scrollHeight,
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

  expect(Math.abs(m.footerBottom - m.docHeight), "el footer es lo último del documento").toBeLessThanOrEqual(1);
  expect(m.docHeight, "el documento mide al menos un viewport").toBeGreaterThanOrEqual(m.innerHeight - 1);
  if (m.docHeight <= m.innerHeight + 1) {
    expect(m.footerTop + m.footerHeight, "si entra, el footer se ve al pie").toBeLessThanOrEqual(m.innerHeight + 1);
  }
  if (opts.fits) expect(m.docHeight, "entra sin scroll").toBeLessThanOrEqual(m.innerHeight + 1);
  expect(m.strayFixed, "nada fixed/sticky fuera de bg|overlay|header").toEqual([]);
  expect(m.scrollWidth, "sin scroll horizontal").toBeLessThanOrEqual(m.innerWidth);
  if (opts.stage) {
    expect(m.stageHeight, "hay GameStage").not.toBeNull();
    const vw = page.viewportSize()!.width;
    if (vw < 768) {
      expect(Math.abs(m.stageHeight! - (m.innerHeight - m.headerHeight)), "celu: el stage mide un viewport").toBeLessThanOrEqual(1);
    } else {
      expect(m.stageHeight!, "PC: el stage tiene su mínimo").toBeGreaterThanOrEqual(34 * 16 - 1);
      const fill = m.innerHeight - m.headerHeight - m.footerHeight;
      if (fill >= 34 * 16) expect(Math.abs(m.stageHeight! - fill), "PC: el stage llena hasta el footer").toBeLessThanOrEqual(1);
    }
    expect(m.overflowing, "nada desborda dentro del stage").toEqual([]);
  }

  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await expect(page.locator("footer")).toBeInViewport();
  await page.evaluate(() => window.scrollTo(0, 0));
}
