import { expect, type Locator, type Page } from "@playwright/test";
import { Client } from "pg";

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

/** Elige qué opción tocar entre las visibles y habilitadas del penal abierto. */
type Pick = (page: Page, options: Locator) => Promise<Locator>;

/** Loop común: mientras no aparezca `done`, toca la opción que diga `pick` en cada penal abierto. */
async function answerLoop(page: Page, pick: Pick, done: RegExp, timeoutMs: number): Promise<number> {
  const deadline = Date.now() + timeoutMs;
  let answered = 0;
  while (Date.now() < deadline) {
    if (await page.getByText(done).first().isVisible()) return answered;
    const options = page.locator("button[aria-pressed]:enabled");
    if ((await options.count()) > 0) {
      await (await pick(page, options)).click({ timeout: 2_000 }).then(
        () => answered++,
        () => undefined, // se cerró el penal entre el count y el click
      );
    }
    await page.waitForTimeout(300);
  }
  throw new Error(`no apareció ${done} en ${timeoutMs / 1000}s (respondió ${answered} penales)`);
}

/**
 * Responde cada penal que aparezca tocando la opción `pick` (0 = primera, -1 = última) hasta que
 * `done` sea visible. Devuelve cuántos penales respondió.
 */
export function answerUntil(page: Page, pick: 0 | -1, done: RegExp, timeoutMs: number): Promise<number> {
  return answerLoop(page, async (_p, options) => (pick === 0 ? options.first() : options.last()), done, timeoutMs);
}

/**
 * Responde cada penal con la opción CORRECTA (leída directo del Postgres local: solo el test la ve,
 * nunca el cliente; ni la secret key puede leer `questions`) y al toque, hasta que `done` sea
 * visible. Los bots tardan ≥4 s → el humano gana todos los duelos y la corrida es determinista. La
 * opción se busca por TEXTO (no por índice): sigue andando si alguna vez hay 2ª chance (que esconde
 * una opción y corre los índices). Devuelve cuántos penales respondió.
 */
export async function answerCorrectUntil(page: Page, done: RegExp, timeoutMs: number): Promise<number> {
  const dbUrl = process.env.E2E_DB_URL ?? "";
  if (!/^postgresql:\/\/[^@]+@(127\.0\.0\.1|localhost):/.test(dbUrl)) {
    throw new Error(`answerCorrectUntil solo contra el Postgres local (E2E_DB_URL=${dbUrl || "∅"})`);
  }
  const db = new Client({ connectionString: dbUrl });
  await db.connect();
  const correct = new Map<string, string>(); // prompt → texto de la correcta
  const pickCorrect: Pick = async (p, options) => {
    const prompt = (await p.locator("button[aria-pressed] >> xpath=../preceding-sibling::p[1]").first().textContent())?.trim() ?? "";
    if (!correct.has(prompt)) {
      const { rows } = await db.query<{ answer: string }>(
        "select options ->> correct_index as answer from public.questions where prompt = $1",
        [prompt],
      );
      if (rows.length !== 1) throw new Error(`pregunta no encontrada (o repetida): "${prompt}"`);
      correct.set(prompt, rows[0]!.answer);
    }
    const answer = correct.get(prompt) ?? "";
    // El botón es "<letra><texto>": se compara el final exacto del texto.
    return options.filter({ hasText: new RegExp(`${answer.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`) }).first();
  };
  try {
    return await answerLoop(page, pickCorrect, done, timeoutMs);
  } finally {
    await db.end();
  }
}
