// Regla de fase (feedback de Gino 14/11, migración `phase_close`): una fase con acción termina cuando
// ACTUARON TODOS los que deben actuar, o al vencer su deadline — lo que pase primero. Vale en todos los
// modos: ranked (2 humanos), salas y torneos con bots (el bot "actúa" en su horario precalculado).
import { afterAll, describe, expect, it } from "vitest";
import type { PoolClient } from "pg";
import { asRole, closePool, resetRole, withRollback } from "./_db";
import { makeMatchFixture, openManualPenalty } from "./_fixtures";

afterAll(closePool);

async function status(c: PoolClient, penalty: string): Promise<string> {
  const { rows } = await c.query<{ status: string }>("select status from public.penalties where id = $1", [penalty]);
  return rows[0]!.status;
}

async function correctOf(c: PoolClient, penalty: string): Promise<number> {
  const { rows } = await c.query<{ correct_index: number }>(
    `select q.correct_index from public.questions q join public.penalties pe on pe.question_id = q.id where pe.id = $1`,
    [penalty],
  );
  return rows[0]!.correct_index;
}

async function answer(c: PoolClient, user: string, penalty: string, option: number): Promise<void> {
  await asRole(c, "authenticated", user);
  await c.query("select public.select_option($1, $2)", [penalty, option]);
  await resetRole(c);
}

describe("regla de fase: cierra cuando actuaron todos o al deadline", () => {
  it("dos humanos responden → el penal se resuelve YA, con el deadline todavía lejos", async () => {
    await withRollback(async (c) => {
      const fx = await makeMatchFixture(c);
      const penalty = await openManualPenalty(c, fx.matchId, fx.pA, fx.pB, 1);
      const ok = await correctOf(c, penalty);

      await answer(c, fx.userA, penalty, ok);
      expect(await status(c, penalty)).toBe("open"); // falta el otro: no se adelanta
      await answer(c, fx.userB, penalty, (ok + 1) % 3);

      const { rows } = await c.query<{ status: string; future: boolean; winner: string }>(
        `select status, deadline > now() as future, resolution ->> 'winner' as winner
           from public.penalties where id = $1`,
        [penalty],
      );
      expect(rows[0]).toEqual({ status: "resolved", future: true, winner: "kicker" });
    });
  });

  it("si falta una respuesta, sigue `too_early` hasta el deadline", async () => {
    await withRollback(async (c) => {
      const fx = await makeMatchFixture(c);
      const penalty = await openManualPenalty(c, fx.matchId, fx.pA, fx.pB, 1);
      await answer(c, fx.userA, penalty, 0);

      await c.query("savepoint sp");
      await expect(c.query("select public.resolve_penalty($1)", [penalty])).rejects.toThrow(/too_early/);
      await c.query("rollback to savepoint sp");
      await c.query("select public.tick()"); // el cron tampoco lo adelanta
      expect(await status(c, penalty)).toBe("open");

      // Al vencer, resuelve como siempre (el que no respondió recibe una al azar).
      await c.query(`update public.penalties set deadline = now() - interval '1 second' where id = $1`, [penalty]);
      await c.query("select public.tick()");
      expect(await status(c, penalty)).not.toBe("open");
    });
  });

  it("humano + bot: cierra cuando el tick materializa al bot (no espera los 10s)", async () => {
    await withRollback(async (c) => {
      const fx = await makeMatchFixture(c);
      await c.query("update public.participants set is_bot = true, user_id = null where id = $1", [fx.pB]);
      const penalty = await openManualPenalty(c, fx.matchId, fx.pA, fx.pB, 1);
      const ok = await correctOf(c, penalty);

      await answer(c, fx.userA, penalty, ok);
      // El bot "piensa" hasta su horario (todavía no le llegó).
      await c.query(
        `insert into public.bot_intents (penalty_id, participant_id, phase, scheduled_answer_at, will_be_correct, chosen_option)
         values ($1, $2, 'first', now() + interval '3 seconds', true, $3)`,
        [penalty, fx.pB, ok],
      );
      await c.query("select public.tick()");
      expect(await status(c, penalty)).toBe("open");

      // Le llega el horario → el tick lo materializa y, con los dos, resuelve en la misma vuelta.
      await c.query(
        `update public.bot_intents set scheduled_answer_at = now() - interval '1 second' where penalty_id = $1`,
        [penalty],
      );
      await c.query("select public.tick()");
      const { rows } = await c.query<{ status: string; future: boolean }>(
        "select status, deadline > now() as future from public.penalties where id = $1",
        [penalty],
      );
      expect(rows[0]).toEqual({ status: "resolved", future: true });
    });
  });

  it("carrera: dos respuestas que no se vieron entre sí → el tick lo cierra (backstop)", async () => {
    await withRollback(async (c) => {
      const fx = await makeMatchFixture(c);
      const penalty = await openManualPenalty(c, fx.matchId, fx.pA, fx.pB, 1);
      // Simula el caso READ COMMITTED: las dos filas existen pero ningún select_option resolvió.
      await c.query(
        `insert into public.penalty_answers (penalty_id, participant_id, option_index, selected_at, is_correct, is_random, phase)
         values ($1, $2, 0, now(), false, false, 'first'), ($1, $3, 1, now(), false, false, 'first')`,
        [penalty, fx.pA, fx.pB],
      );
      expect(await status(c, penalty)).toBe("open");
      await c.query("select public.tick()");
      await c.query("select public.tick()"); // idempotente: no duplica nada
      expect(await status(c, penalty)).not.toBe("open");
      const { rows } = await c.query<{ n: string }>(
        "select count(*) n from public.penalty_answers where penalty_id = $1 and phase = 'first'",
        [penalty],
      );
      expect(Number(rows[0]!.n)).toBe(2);
    });
  });

  it("la 2ª chance también cierra apenas responden los dos", async () => {
    await withRollback(async (c) => {
      const fx = await makeMatchFixture(c);
      const penalty = await openManualPenalty(c, fx.matchId, fx.pA, fx.pB, 1);
      const ok = await correctOf(c, penalty);
      await answer(c, fx.userA, penalty, (ok + 1) % 3);
      await answer(c, fx.userB, penalty, (ok + 2) % 3);
      expect(await status(c, penalty)).toBe("second_chance");

      await answer(c, fx.userA, penalty, ok);
      await answer(c, fx.userB, penalty, ok);
      expect(await status(c, penalty)).toBe("resolved");
    });
  });
});
