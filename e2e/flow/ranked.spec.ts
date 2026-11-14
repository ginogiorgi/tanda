import { expect, test, type Browser, type Page } from "@playwright/test";
import { answerUntil, assertLocalSupabase, enterAsGuest } from "./_helpers";

/**
 * Ranked 1v1 con dos humanos reales (dos contextos = dos invitados): cola → emparejados entre sí →
 * partido (5 penales por lado + muerte súbita) → resultado con puntos de liga, uno gana y el otro
 * pierde. Cada uno toca una opción distinta (A la primera, B la última) → nunca aciertan los dos el
 * mismo penal y la muerte súbita termina.
 */

test.beforeAll(assertLocalSupabase);

async function guestInQueue(browser: Browser): Promise<Page> {
  const ctx = await browser.newContext({ ...test.info().project.use });
  const page = await ctx.newPage();
  await enterAsGuest(page);
  await page.getByRole("button", { name: "Jugar", exact: true }).click();
  await page.getByRole("button", { name: /ranked 1v1/i }).click();
  await expect(page).toHaveURL(/\/ranked$/, { timeout: 20_000 });
  return page;
}

test("ranked 1v1: dos invitados se emparejan, juegan y se reparten los puntos", async ({ browser }) => {
  test.setTimeout(420_000);
  const errors: string[] = [];
  const [a, b] = await Promise.all([guestInQueue(browser), guestInQueue(browser)]);
  for (const p of [a, b]) p.on("pageerror", (e) => errors.push(e.message));

  await test.step("emparejados → /partido", async () => {
    await Promise.all([a, b].map((p) => expect(p).toHaveURL(/\/partido$/, { timeout: 60_000 })));
  });

  let answered: number[] = [];
  await test.step("juegan hasta el resultado", async () => {
    answered = await Promise.all([answerUntil(a, 0, /Otra ranked/, 330_000), answerUntil(b, -1, /Otra ranked/, 330_000)]);
  });
  expect(answered[0]).toBeGreaterThanOrEqual(5);
  expect(answered[1]).toBeGreaterThanOrEqual(5);

  await test.step("uno ganó, el otro perdió, y los puntos van en sentidos opuestos", async () => {
    const outcome = async (p: Page) => ((await p.getByRole("heading", { level: 1 }).innerText()).trim().toUpperCase());
    const [oa, ob] = await Promise.all([outcome(a), outcome(b)]);
    expect([oa, ob].sort()).toEqual(["GANASTE", "PERDISTE"]);
    const delta = async (p: Page) => Number((await p.getByText(/^[+−-]\d+$/).first().innerText()).replace("−", "-"));
    const [da, db] = await Promise.all([delta(a), delta(b)]);
    expect(Math.sign(da)).toBe(oa === "GANASTE" ? 1 : -1);
    expect(Math.sign(db)).toBe(ob === "GANASTE" ? 1 : -1);
  });

  expect(errors).toEqual([]);
});
