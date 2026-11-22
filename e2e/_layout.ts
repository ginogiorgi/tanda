import { expect, type Page } from "@playwright/test";

/**
 * Regla única de layout (docs/DESIGN-RULES.md §Layout; feedback 3 #10), verificada en el DOM real:
 *  1. hay footer (uno) en las pantallas de menú/sitio; en JUEGO (`stage`) no hay ninguno (feedback 4 #10);
 *  2. el footer es lo ÚLTIMO del documento y el documento mide al menos el viewport: si el contenido entra,
 *     no hay scroll y el footer se ve al pie; si no entra, se llega al footer scrolleando;
 *  3. nada fijo/sticky fuera de lo permitido (`data-layer` bg|overlay|header) — ni tapando contenido;
 *  4. sin scroll horizontal de página;
 *  5. en juego, el `GameStage` mide el viewport (menos el header) — en celu exacto y sin scroll de página;
 *     desde `md`, con piso de 34rem — y nada desborda adentro (salvo la tarjeta del penal, con su `max-h`).
 *  `fits: true` exige además que la pantalla entre sin scroll (home y /jugar en PC).
 */
export const VIEWPORTS = [
  { name: "360x640", width: 360, height: 640 },
  { name: "430x932", width: 430, height: 932 },
  { name: "820x1180", width: 820, height: 1180 },
  { name: "1440x900", width: 1440, height: 900 },
] as const;

export async function assertLayout(
  page: Page,
  opts: { stage?: boolean; fits?: boolean; /** Pantalla del grupo de juego (sala, cola, partido): sin footer. */ game?: boolean } = {},
): Promise<void> {
  const game = opts.game === true || opts.stage === true;
  await expect(page.locator("footer")).toHaveCount(game ? 0 : 1);
  // El footer vive en los layouts de grupo (dentro del Suspense del loading raíz): con streaming llega primero en
  // un contenedor oculto y después se mueve a su lugar → se mide recién cuando está visible.
  if (!game) await expect(page.locator("footer")).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));

  const m = await page.evaluate(() => {
    const footer = document.querySelector("footer");
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
    const fr = footer?.getBoundingClientRect() ?? null;
    return {
      footerTop: fr?.top ?? 0,
      footerBottom: fr ? fr.bottom + window.scrollY : 0,
      footerHeight: fr?.height ?? 0,
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

  if (!game) expect(Math.abs(m.footerBottom - m.docHeight), "el footer es lo último del documento").toBeLessThanOrEqual(1);
  expect(m.docHeight, "el documento mide al menos un viewport").toBeGreaterThanOrEqual(m.innerHeight - 1);
  if (!game && m.docHeight <= m.innerHeight + 1) {
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
      // Feedback 4 #10: sin footer en juego, la pantalla del partido NO scrollea en el celu.
      expect(m.docHeight, "celu: el juego no scrollea").toBeLessThanOrEqual(m.innerHeight + 1);
    } else {
      expect(m.stageHeight!, "PC: el stage tiene su mínimo").toBeGreaterThanOrEqual(34 * 16 - 1);
      const fill = m.innerHeight - m.headerHeight;
      if (fill >= 34 * 16) expect(Math.abs(m.stageHeight! - fill), "PC: el stage llena el viewport").toBeLessThanOrEqual(1);
    }
    expect(m.overflowing, "nada desborda dentro del stage").toEqual([]);
  }

  if (!game) {
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await expect(page.locator("footer")).toBeInViewport();
    await page.evaluate(() => window.scrollTo(0, 0));
  }
}
