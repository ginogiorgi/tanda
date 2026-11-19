import { test, type Page } from "@playwright/test";
import path from "node:path";

/** Guarda una captura en `SHOTS_DIR` como `<proyecto>-<nombre>.png` (390-home.png, 1440-home.png…). */
export async function shot(page: Page, name: string, opts: { fullPage?: boolean } = {}): Promise<void> {
  const dir = process.env.SHOTS_DIR ?? "artifacts/shots";
  await page.waitForTimeout(250); // transiciones CSS de entrada
  await page.screenshot({ path: path.join(dir, `${test.info().project.name}-${name}.png`), fullPage: opts.fullPage ?? false });
}

/** URL del `next dev` que levanta la config de capturas (para los bancos `/dev/*`). */
export function devUrl(p: string): string {
  return `${process.env.SHOTS_DEV_URL ?? "http://localhost:3102"}${p}`;
}
