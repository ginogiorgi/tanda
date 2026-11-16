// Ayuda obligatoria por forma de jugar (feedback 2, P6): todo `game_modes` activo tiene su entrada en el
// registro del front (sin caer al fallback de getMode) con la ayuda completa; ranked va por PLAY_KINDS.
import { afterAll, describe, expect, it } from "vitest";
import { findMode, PLAY_KINDS, type PlayKindId } from "@/lib/modes";
import { closePool, withRollback } from "./_db";

afterAll(closePool);

describe("ayuda de modos", () => {
  it("cada game_mode activo tiene registro + ayuda (sin fallback)", async () => {
    await withRollback(async (c) => {
      const { rows } = await c.query<{ id: string }>("select id from public.game_modes where active");
      expect(rows.length).toBeGreaterThan(0);
      for (const { id } of rows) {
        const help = id in PLAY_KINDS ? PLAY_KINDS[id as PlayKindId].help : findMode(id)?.help;
        expect(help, `modo ${id} sin ayuda`).toBeDefined();
        if (id in PLAY_KINDS) continue;
        expect(findMode(id)?.id).toBe(id);
        for (const text of Object.values(help ?? {})) expect(String(text).trim().length).toBeGreaterThan(10);
      }
    });
  });
});
