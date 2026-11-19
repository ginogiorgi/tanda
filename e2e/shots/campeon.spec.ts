import { expect, test, type Page } from "@playwright/test";
import { devUrl, shot } from "./_shot";

/**
 * Pantalla de fin de torneo (feedback 3 #6) en el banco `/dev/campeon`: campeón en 3 cuadros del vuelo de
 * los papelitos (0,3 s · 1 s · quietos) + reduced motion + subcampeón. Además verifica la capa: sobre el
 * título y los botones lo primero que hay NO es un papelito (están detrás del contenido).
 */
async function assertConfettiBehind(page: Page): Promise<void> {
  const targets = [
    page.getByText("¡Campeón!", { exact: true }),
    page.getByRole("button", { name: "Jugar de nuevo" }),
    page.getByRole("link", { name: "Volver al inicio" }),
  ];
  for (const t of targets) {
    const box = await t.boundingBox();
    expect(box).not.toBeNull();
    if (!box) continue;
    const pts: [number, number][] = [
      [box.x + 4, box.y + box.height / 2],
      [box.x + box.width / 2, box.y + box.height / 2],
      [box.x + box.width - 4, box.y + box.height / 2],
    ];
    for (const [x, y] of pts) {
      const top = await page.evaluate(([px, py]) => {
        const el = document.elementsFromPoint(px!, py!)[0];
        return el?.closest("[data-testid=confetti]") ? "confetti" : (el?.tagName ?? "none");
      }, [x, y]);
      expect(top, `papelito encima de ${await t.textContent()} en (${x},${y})`).not.toBe("confetti");
    }
  }
}

test("campeón: vuelo de papelitos y capa", async ({ page }) => {
  await page.goto(devUrl("/dev/campeon"));
  await expect(page.getByText("¡Campeón!", { exact: true })).toBeVisible({ timeout: 60_000 });
  await page.reload();
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${process.env.SHOTS_DIR ?? "artifacts/shots"}/${test.info().project.name}-campeon-t0.3.png` });
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${process.env.SHOTS_DIR ?? "artifacts/shots"}/${test.info().project.name}-campeon-t1.0.png` });
  await page.waitForTimeout(3000);
  await assertConfettiBehind(page);
  await shot(page, "campeon-final");
  await shot(page, "campeon-final-full", { fullPage: true });
});

test("campeón: reduced motion (papelitos quietos)", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(devUrl("/dev/campeon"));
  await expect(page.getByText("¡Campeón!", { exact: true })).toBeVisible({ timeout: 60_000 });
  // Sin vuelo: cada papelito ya está en su lugar (sin animación) al primer cuadro.
  const animated = await page.locator(".confetti-piece").evaluateAll((els) =>
    els.filter((e) => getComputedStyle(e).animationName !== "none").length,
  );
  expect(animated).toBe(0);
  await assertConfettiBehind(page);
  await shot(page, "campeon-reduced");
});

test("subcampeón: sin papelitos", async ({ page }) => {
  await page.goto(devUrl("/dev/campeon?place=2"));
  await expect(page.getByText(/Subcampeón/)).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId("confetti")).toHaveCount(0);
  await shot(page, "campeon-sub");
});
