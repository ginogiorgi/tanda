import type { Page } from "@playwright/test";

/**
 * Regla "una sola acción principal por pantalla" (feedback 14/11, docs/DESIGN-RULES.md). La acción
 * principal es, visualmente, el botón ROJO de imprenta (`bg-brand`, o `bg-brand-ink` en hover: en
 * touch el hover queda pegado donde tocaste): se cuentan los `a`/`button` visibles con ese fondo, se hayan armado con `Button`, con `buttonVariants` o a mano. Así la regla
 * no depende de que alguien se acuerde de marcar el componente.
 */
export async function visiblePrimaries(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    // Los botones animan el fondo (transition 100ms): se leen en su estado final, no a mitad de camino.
    for (const a of document.getAnimations()) if (a instanceof CSSTransition) a.finish();
    const reds = new Set(
      ["bg-brand", "bg-brand-ink"].map((cls) => {
        const probe = document.createElement("div");
        probe.className = cls;
        document.body.appendChild(probe);
        const color = getComputedStyle(probe).backgroundColor;
        probe.remove();
        return color;
      }),
    );
    return Array.from(document.querySelectorAll<HTMLElement>("a, button"))
      .filter((el) => {
        const r = el.getBoundingClientRect();
        const st = getComputedStyle(el);
        return r.width > 0 && r.height > 0 && st.visibility !== "hidden" && reds.has(st.backgroundColor);
      })
      .map((el) => (el.textContent ?? "").trim());
  });
}
