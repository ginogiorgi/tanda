// F10 / 10.11 — `select_option`: PRIMER TAP GANA (respuesta no cambiable). Revierte el contrato
// histórico "última selección gana". Verifica: la primera selección se guarda; un re-tap de la MISMA
// opción es idempotente (no error, no segunda fila); un cambio a otra opción se rechaza con
// `already_answered`; y queda exactamente UNA fila con la opción original.
import { afterAll, describe, expect, it } from "vitest";
import { closePool, withRollback, asRole, resetRole } from "./_db";
import { makeMatchFixture, openManualPenalty } from "./_fixtures";

afterAll(closePool);

describe("select_option: primer tap gana (10.11)", () => {
  it("guarda el primer tap, ignora el re-tap igual y rechaza el cambio", async () => {
    await withRollback(async (c) => {
      const fx = await makeMatchFixture(c);
      const penalty = await openManualPenalty(c, fx.matchId, fx.pA, fx.pB, 1);

      // userA (kicker) elige la opción 1.
      await asRole(c, "authenticated", fx.userA);
      await c.query("select public.select_option($1, $2)", [penalty, 1]);

      // Re-tap de la MISMA opción: idempotente, sin error.
      await expect(
        c.query("select public.select_option($1, $2)", [penalty, 1]),
      ).resolves.toBeDefined();

      // Cambio a otra opción: rechazado (no cambiable). El `raise` aborta la transacción, así que lo
      // envolvemos en un savepoint para poder seguir consultando después del rollback parcial.
      await c.query("savepoint sp_change");
      await expect(
        c.query("select public.select_option($1, $2)", [penalty, 2]),
      ).rejects.toThrow(/already_answered/);
      await c.query("rollback to savepoint sp_change");
      await resetRole(c);

      // Exactamente una fila, con la opción original (1).
      const { rows } = await c.query<{ n: string; option_index: number }>(
        `select count(*) n, max(option_index) option_index
           from public.penalty_answers
          where penalty_id = $1 and participant_id = $2 and phase = 'first'`,
        [penalty, fx.pA],
      );
      expect(Number(rows[0]!.n)).toBe(1);
      expect(rows[0]!.option_index).toBe(1);
    });
  });
});
