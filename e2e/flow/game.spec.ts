import { expect, test } from "../_csp";
import { assertLocalSupabase, enterAsGuest, openPlay } from "./_helpers";
import { assertLayout, VIEWPORTS } from "../_layout";

/**
 * Flujo de juego completo como invitado: sesión anónima → Jugar (Mundial) → sala → lobby (30 s
 * real) → partido → responder un penal → resolución (GOL/ATAJADO). Además verifica la regla de oro:
 * `correct_index` no viaja al cliente (REST ni Realtime) mientras el penal está abierto. Y que el 3D
 * nunca muestra otro muñeco: placeholder → error con reintento → escena.
 */

test.beforeAll(assertLocalSupabase);

/** Línea de tiempo del penal en el DOM (instante de cada transición): jugada sin cartel, cartel, pregunta. */
type Ev = { at: number; kind: "playing" | "card" | "card-end" | "question" };
declare global {
  interface Window {
    __penalEvents?: Ev[];
  }
}

test("invitado → sala → partido → penal resuelto", async ({ page }) => {
  test.setTimeout(330_000);
  await page.addInitScript(() => {
    const evs: Ev[] = (window.__penalEvents = []);
    let state = { playing: false, card: false, question: false };
    const check = () => {
      const now = {
        playing: !!document.querySelector("[data-testid=penal-playing]"),
        card: !!document.querySelector("[data-testid=penal-result-card]"),
        question: !!document.querySelector("button[data-option]"),
      };
      const at = performance.timeOrigin + performance.now();
      if (now.playing && !state.playing) evs.push({ at, kind: "playing" });
      if (now.card && !state.card) evs.push({ at, kind: "card" });
      if (!now.card && state.card) evs.push({ at, kind: "card-end" });
      if (now.question && !state.question) evs.push({ at, kind: "question" });
      state = now;
    };
    new MutationObserver(check).observe(document, { subtree: true, childList: true });
  });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  // Todo lo que llega del server mientras el penal está abierto (hasta responder).
  const payloads: string[] = [];
  let collecting = true;
  page.on("response", async (r) => {
    if (!collecting || !/\/(rest|realtime)\/v1\//.test(r.url())) return;
    try {
      payloads.push(`${r.url()} ${await r.text()}`);
    } catch {
      // cuerpo no disponible (redirect/preflight)
    }
  });
  page.on("websocket", (ws) => {
    ws.on("framereceived", (f) => {
      if (collecting) payloads.push(`ws ${typeof f.payload === "string" ? f.payload : f.payload.toString()}`);
    });
  });

  await test.step("entra como invitado", async () => {
    await enterAsGuest(page);
  });

  // P2.1 (feedback 2): sin muñeco de reemplazo. (Antes de la sala: la precarga de ahí también falla.) Los GLB tardan y después fallan → placeholder neutro,
  // después error con "Reintentar"; al reintentar con la red bien, recién ahí aparece la escena 3D.
  const glb = "**/models/avatar/*.glb";
  await page.route(glb, async (route) => {
    await new Promise((r) => setTimeout(r, 2_500));
    await route.abort();
  });

  await test.step("Jugar → Mundial → sala", async () => {
    await openPlay(page);
    await page.getByRole("group", { name: /elegí el modo para jugar/i }).getByRole("button", { name: /^mundial/i }).click();
    await expect(page).toHaveURL(/\/sala\/[A-Z0-9]+$/, { timeout: 20_000 });
    // P3: la sala espera 30 s (TIMING/lobby_seconds), no el minuto de antes.
    await expect(page.getByTestId("lobby-countdown")).toHaveText(/^0:(30|[12]\d)$/, { timeout: 10_000 });
  });

  await test.step("lobby → partido (el server arma el torneo con bots)", async () => {
    await expect(page).toHaveURL(/\/partido$/, { timeout: 120_000 });
  });

  await test.step("3D: placeholder mientras carga, error claro si falla, escena al reintentar", async () => {
    await expect(page.getByTestId("scene-skeleton").first()).toBeVisible({ timeout: 30_000 });
    await expect(page.locator("canvas")).toHaveCount(0);
    await expect(page.getByTestId("scene-error")).toBeVisible({ timeout: 15_000 });
    await expect(page.locator("canvas")).toHaveCount(0);
    await page.unroute(glb);
    await page.getByTestId("scene-error").getByRole("button", { name: "Reintentar" }).click();
    await expect(page.locator("canvas")).toHaveCount(1, { timeout: 15_000 });
    await expect(page.getByTestId("scene-skeleton")).toHaveCount(0);
  });

  await test.step("responde el primer penal", async () => {
    const options = page.locator("button[data-option]");
    await expect(options.first()).toBeEnabled({ timeout: 90_000 });
    // P5: el tablero arranca con los 3+3 slots de grupos, todos pendientes.
    const dots = page.getByTestId("penalty-dots");
    await expect(dots).toHaveCount(2);
    await expect(page.locator('[data-dot="pending"]')).toHaveCount(6);
    // Con el penal abierto y antes de responder: la correcta no viajó al cliente.
    collecting = false;
    expect(payloads.length).toBeGreaterThan(0);
    expect(payloads.filter((p) => p.includes("correct_index"))).toEqual([]);
    // Feedback 4 #12/#14: marca el <canvas> de la escena; tiene que ser el MISMO nodo en la jugada y en el cartel
    // (antes cada fase remontaba el Canvas: pantallazo claro + la jugada arrancaba de nuevo).
    await page.locator("canvas").evaluate((c) => c.setAttribute("data-e2e-canvas", "penal-1"));
    await options.first().click();
    // Feedback 3 #2: el penal no se cierra antes de los 10 s → la respuesta queda fija y a la vista.
    await expect(page.getByText(/respondiste a los/i)).toBeVisible({ timeout: 10_000 });
    await expect(options.first()).toBeDisabled();
  });

  await test.step("resolución a los 10s", async () => {
    await expect(page.getByTestId("penal-playing")).toBeAttached({ timeout: 30_000 });
    await expect(page.locator("canvas[data-e2e-canvas=penal-1]")).toHaveCount(1);
    await expect(page.getByText(/¡GOL!|ATAJADO/)).toBeVisible({ timeout: 30_000 });
    await expect(page.locator("canvas[data-e2e-canvas=penal-1]")).toHaveCount(1);
    await expect(page.getByTestId("scene-skeleton")).toHaveCount(0);
    // El slot de ese penal se pinta al resolverse (verde gol / rojo errado).
    await expect(page.locator('[data-dot="scored"], [data-dot="missed"]')).toHaveCount(1, { timeout: 10_000 });
  });

  await test.step("penal (resultado y el que sigue): GameStage de un viewport (360, mobile y 1440), footer abajo del pliegue", async () => {
    // Después de responder: con el cierre temprano, chequear antes cambiaba el timing del penal.
    const mobile = page.viewportSize()!;
    for (const vp of [VIEWPORTS[0], VIEWPORTS[3]]) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await assertLayout(page, { stage: true });
    }
    await page.setViewportSize(mobile);
    await assertLayout(page, { stage: true });
  });

  await test.step("revelado y huecos con reloj real: jugada sin cartel → cartel ≥2,4 s → próximo penal", async () => {
    // Se espera al fin del partido de grupos: un cartel que se va y ninguna pregunta en los 3 s siguientes.
    await expect
      .poll(
        async () =>
          page.evaluate(() => {
            const evs = window.__penalEvents ?? [];
            const last = evs.at(-1);
            const cards = evs.filter((e) => e.kind === "card").length;
            return cards >= 2 && last?.kind === "card-end" && Date.now() - last.at > 3000;
          }),
        { timeout: 200_000, intervals: [1000] },
      )
      .toBe(true);
    const evs = await page.evaluate(() => window.__penalEvents ?? []);
    const cards: number[] = [];
    const reveals: number[] = [];
    const gaps: number[] = [];
    evs.forEach((e, i) => {
      if (e.kind === "card") {
        const end = evs.slice(i + 1).find((x) => x.kind === "card-end");
        if (end) cards.push(end.at - e.at);
        const playing = evs.slice(0, i).reverse().find((x) => x.kind === "playing");
        if (playing) reveals.push(e.at - playing.at);
      }
      if (e.kind === "playing") {
        const next = evs.slice(i + 1).find((x) => x.kind === "question" || x.kind === "playing");
        if (next?.kind === "question") gaps.push(next.at - e.at);
      }
    });
    console.log(`[revelado] cartel ${cards.map((x) => Math.round(x)).join(",")} ms · jugada ${reveals.map((x) => Math.round(x)).join(",")} ms · hueco ${gaps.map((x) => Math.round(x)).join(",")} ms`);
    expect(cards.length).toBeGreaterThanOrEqual(2);
    // El cartel se lee entero, el ÚLTIMO del partido incluido (#12: antes se veía un instante). El hueco del server es
    // fijo (jugada + cartel): en una máquina lenta (runner de CI) la jugada se estira ~0,5 s y el cartel se acorta lo
    // mismo → lo que se mide es la suma (≥ 4,0 s) y un piso de 2 s para el cartel.
    cards.forEach((d, i) => {
      expect(d).toBeGreaterThanOrEqual(2000);
      if (reveals[i] !== undefined) expect(d + reveals[i]!).toBeGreaterThanOrEqual(4000);
    });
    // El cartel aparece recién cuando la jugada terminó (~1,6 s), nunca con la pelota en vuelo.
    for (const d of reveals) expect(d).toBeGreaterThanOrEqual(1500);
    // Resultado → próximo penal = betweenPenalsS (4,1 s) ± 1 s (incluye el ≤1 s del cron). El runner de CI, más lento,
    // suma ~1 s observado desde el cliente (medido 20/11: 5,0–5,2 s) → ± 1,5 s ahí. Un hueco de 10 s falla igual.
    const slack = process.env.CI ? 1500 : 1000;
    expect(gaps.length).toBeGreaterThanOrEqual(1);
    for (const d of gaps) {
      expect(d).toBeGreaterThanOrEqual(4100 - slack);
      expect(d).toBeLessThanOrEqual(4100 + slack);
    }
  });

  expect(errors).toEqual([]);
});
