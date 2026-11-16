import { expect, test } from "../_csp";
import { assertLocalSupabase, enterAsGuest, openPlay } from "./_helpers";

/**
 * Entrada como invitado aislada (bug "Entrando…": el botón quedaba colgado tras un sign-in anónimo OK).
 * Corto a propósito para correrlo en loop: `pnpm test:e2e:flow guest --repeat-each=20`.
 */

test.beforeAll(assertLocalSupabase);

test("Jugar como invitado → home con el menú de juego", async ({ page }) => {
  await enterAsGuest(page);
  // Flake "Próximamente": la home renderizaba los modos deshabilitados (query de game_modes fallida).
  await openPlay(page);
  const modes = page.getByRole("group", { name: /elegí el modo para jugar/i });
  await expect(modes.getByRole("button", { name: /^mundial/i })).toBeEnabled();
  await expect(modes.getByRole("button", { name: /^fútbol argentino/i })).toBeEnabled();
});
