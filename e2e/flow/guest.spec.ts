import { test } from "@playwright/test";
import { assertLocalSupabase, enterAsGuest } from "./_helpers";

/**
 * Entrada como invitado aislada (bug "Entrando…": el botón quedaba colgado tras un sign-in anónimo OK).
 * Corto a propósito para correrlo en loop: `pnpm test:e2e:flow guest --repeat-each=20`.
 */

test.beforeAll(assertLocalSupabase);

test("Jugar como invitado → home con el menú de juego", async ({ page }) => {
  await enterAsGuest(page);
});
