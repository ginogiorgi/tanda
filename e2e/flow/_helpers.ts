import { expect, type Page } from "@playwright/test";

const LOCAL = /^http:\/\/(127\.0\.0\.1|localhost)[:/]/;

/** Doble seguro (además de scripts/e2e/flow.sh): estos tests crean usuarios reales. */
export function assertLocalSupabase(): void {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  if (process.env.E2E_FLOW !== "1" || !LOCAL.test(url)) {
    throw new Error(`e2e de flujo solo contra Supabase local (NEXT_PUBLIC_SUPABASE_URL=${url || "∅"})`);
  }
}

/** Landing → "Jugar como invitado" → home con el menú de juego. */
export async function enterAsGuest(page: Page): Promise<void> {
  await page.goto("/");
  await page.getByRole("button", { name: "Jugar como invitado" }).click();
  await expect(page.getByRole("button", { name: "Jugar", exact: true })).toBeVisible({ timeout: 20_000 });
}

/**
 * Responde cada penal que aparezca tocando la opción `pick` (0 = primera, -1 = última) hasta que
 * `done` sea visible. Devuelve cuántos penales respondió.
 */
export async function answerUntil(page: Page, pick: 0 | -1, done: RegExp, timeoutMs: number): Promise<number> {
  const deadline = Date.now() + timeoutMs;
  let answered = 0;
  while (Date.now() < deadline) {
    if (await page.getByText(done).first().isVisible()) return answered;
    const options = page.locator("button[aria-pressed]:enabled");
    const n = await options.count();
    if (n > 0) {
      await options.nth(pick === 0 ? 0 : n - 1).click().then(
        () => answered++,
        () => undefined, // se cerró el penal entre el count y el click
      );
    }
    await page.waitForTimeout(400);
  }
  throw new Error(`no apareció ${done} en ${timeoutMs / 1000}s (respondió ${answered} penales)`);
}
