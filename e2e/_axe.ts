import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";

/**
 * Escaneo axe de página completa (WCAG 2 A/AA, serious + critical). En navegación cliente Next actualiza el
 * `<title>` un instante DESPUÉS del contenido: escanear en ese hueco daba `document-title` intermitente
 * (feedback 4). Se espera a que la página tenga título antes de medir.
 */
export async function expectNoSeriousA11y(page: Page): Promise<void> {
  await expect(page).toHaveTitle(/\S/);
  const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  const bad = axe.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(bad.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
}
