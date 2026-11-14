import type { Page } from "@playwright/test";

/**
 * Regla "una sola acción principal por pantalla" (feedback 14/11, docs/DESIGN-RULES.md). La acción
 * principal es, visualmente, el botón ROJO de imprenta (`bg-brand`): se cuentan los `a`/`button`
 * visibles con ese fondo, se hayan armado con `Button`, con `buttonVariants` o a mano. Así la regla
 * no depende de que alguien se acuerde de marcar el componente.
 */
export async function visiblePrimaries(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const probe = document.createElement("div");
    probe.className = "bg-brand";
    document.body.appendChild(probe);
    const brand = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return Array.from(document.querySelectorAll<HTMLElement>("a, button"))
      .filter((el) => {
        const r = el.getBoundingClientRect();
        const st = getComputedStyle(el);
        return r.width > 0 && r.height > 0 && st.visibility !== "hidden" && st.backgroundColor === brand;
      })
      .map((el) => (el.textContent ?? "").trim());
  });
}
