import AxeBuilder from "@axe-core/playwright";
import { Client } from "pg";
import { expect, test } from "../_csp";
import { assertLayout } from "../_layout";
import { assertLocalSupabase, enterAsGuest, openPlay } from "./_helpers";

/**
 * Reportar bug / pedir mejora (feedback 3 #17): el botón flotante vive en la home y en el menú (nunca en
 * juego), abre la hoja, manda el reporte a `POST /api/feedback` (que lo guarda; sin `RESEND_API_KEY` no hay
 * mail) y confirma. El honeypot lleno no guarda nada.
 */
test.beforeAll(assertLocalSupabase);

async function reportsLike(text: string): Promise<{ kind: string; route: string; username: string | null; user_id: string | null }[]> {
  const db = new Client({ connectionString: process.env.E2E_DB_URL });
  await db.connect();
  try {
    const { rows } = await db.query("select kind, route, username, user_id from public.feedback_reports where message like $1", [`%${text}%`]);
    return rows;
  } finally {
    await db.end();
  }
}

test("invitado: reporta una mejora desde /jugar y queda guardada", async ({ page }) => {
  const tag = `e2e-${Date.now()}`;
  await enterAsGuest(page);
  const button = page.getByTestId("feedback-button");
  await expect(button).toBeVisible();
  await assertLayout(page);

  await openPlay(page);
  await expect(button).toBeVisible();
  await assertLayout(page, { fits: (page.viewportSize()?.width ?? 0) >= 1024 });
  await button.click();

  const sheet = page.getByTestId("feedback-sheet");
  await expect(sheet).toBeVisible();
  // axe sobre el cuadro final (la entrada de la hoja anima opacidad y da contrastes intermedios).
  await sheet.evaluate((el) => Promise.all(el.getAnimations({ subtree: true }).map((a) => a.finished)));
  const axe = await new AxeBuilder({ page }).include("[data-testid=feedback-sheet]").withTags(["wcag2a", "wcag2aa"]).analyze();
  expect(axe.violations.map((v) => `${v.id}: ${v.nodes.map((n) => `${n.target.join(" ")} ${n.failureSummary ?? ""}`).join(" | ")}`)).toEqual([]);

  const send = sheet.getByRole("button", { name: "Enviar" });
  await expect(send).toBeDisabled(); // vacío
  await sheet.getByText("Mejora", { exact: true }).click();
  await expect(sheet.getByRole("radio", { name: /Mejora/ })).toBeChecked();
  const text = sheet.getByRole("textbox", { name: "¿Qué te gustaría?" });
  await text.fill(`Que se pueda elegir el arquero ${tag}`);
  await expect(sheet.getByText(`${`Que se pueda elegir el arquero ${tag}`.length}/1000`)).toBeVisible();
  await send.click();
  await expect(sheet.getByRole("heading", { name: "¡Gracias!" })).toBeVisible({ timeout: 15_000 });
  await sheet.getByRole("button", { name: "Cerrar" }).click();
  await expect(sheet).toBeHidden();

  const rows = await reportsLike(tag);
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ kind: "idea", route: "/jugar", username: null });
  expect(rows[0]?.user_id).toBeTruthy();
});

test("honeypot lleno: responde ok y no guarda", async ({ page }) => {
  const tag = `bot-${Date.now()}`;
  await page.goto("/");
  const res = await page.request.post("/api/feedback", {
    data: { kind: "bug", message: `spam ${tag}`, website: "http://spam.example", route: "/" },
  });
  expect(res.status()).toBe(200);
  expect(await reportsLike(tag)).toHaveLength(0);
  const bad = await page.request.post("/api/feedback", { data: { kind: "bug", message: "x".repeat(1001) } });
  expect(bad.status()).toBe(400);
});

test("no aparece en la sala ni en el juego", async ({ page }) => {
  await enterAsGuest(page);
  await openPlay(page);
  // Sala PRIVADA y salir: un invitado colgado en una sala pública lo levanta el próximo test (game.spec) y su
  // partido fantasma (2ª chance) estira el reloj de ronda compartido.
  await page.getByRole("button", { name: "Crear sala" }).click();
  await page.getByRole("group", { name: /crear sala/i }).getByRole("button", { name: /^mundial/i }).click();
  await expect(page).toHaveURL(/\/sala\/[A-Z0-9]+$/, { timeout: 20_000 });
  await expect(page.getByRole("button", { name: "Salir" })).toBeVisible();
  await expect(page.getByTestId("feedback-button")).toHaveCount(0);
  await page.getByRole("button", { name: "Salir" }).click();
  await expect(page).toHaveURL(/\/jugar$/);
});
