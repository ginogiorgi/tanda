// Tarea 10 — segunda chance: cuando erran los DOS en la 1ª fase, a cada jugador se le quita la
// opción que ÉL eligió (por participante), no una al azar compartida. Verifica que resolve_penalty
// deja `removed_option_kicker` = pick del pateador y `removed_option_keeper` = pick del arquero.
import { afterAll, describe, expect, it } from "vitest";
import { closePool, withRollback, asRole, resetRole } from "./_db";
import { makeMatchFixture, openManualPenalty } from "./_fixtures";

afterAll(closePool);

describe("segunda chance: se quita la opción de cada jugador (tarea 10)", () => {
  it("removed_option_kicker = pick del pateador, removed_option_keeper = pick del arquero", async () => {
    await withRollback(async (c) => {
      const fx = await makeMatchFixture(c);
      const penalty = await openManualPenalty(c, fx.matchId, fx.pA, fx.pB, 1);

      // Opción correcta de la pregunta → elegimos DOS incorrectas distintas (una por jugador).
      const { rows: qr } = await c.query<{ correct_index: number }>(
        `select q.correct_index
           from public.questions q
           join public.penalties pe on pe.question_id = q.id
          where pe.id = $1`,
        [penalty],
      );
      const correct = qr[0]!.correct_index;
      const wrongKicker = (correct + 1) % 3;
      const wrongKeeper = (correct + 2) % 3;

      // pA (pateador) y pB (arquero) eligen, cada uno, una incorrecta distinta → "los dos mal".
      await asRole(c, "authenticated", fx.userA);
      await c.query("select public.select_option($1, $2)", [penalty, wrongKicker]);
      await resetRole(c);
      await asRole(c, "authenticated", fx.userB);
      await c.query("select public.select_option($1, $2)", [penalty, wrongKeeper]);
      await resetRole(c);

      // Feedback 3 #2: la 1ª fase se resuelve recién al vencer el deadline (aunque respondieron los dos).
      await c.query("update public.penalties set deadline = now() - interval '1 second' where id = $1", [penalty]);
      await c.query("select public.tick()");

      const { rows } = await c.query<{
        status: string;
        removed_option: number;
        removed_option_kicker: number;
        removed_option_keeper: number;
      }>(
        `select status, removed_option, removed_option_kicker, removed_option_keeper
           from public.penalties where id = $1`,
        [penalty],
      );
      const p = rows[0]!;
      expect(p.status).toBe("second_chance");
      expect(p.removed_option_kicker).toBe(wrongKicker);
      expect(p.removed_option_keeper).toBe(wrongKeeper);
      // compat: la columna vieja conserva la del pateador.
      expect(p.removed_option).toBe(wrongKicker);
    });
  });
});
