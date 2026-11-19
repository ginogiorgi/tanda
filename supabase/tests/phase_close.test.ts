// Regla de fase (feedback 3 #2, migración `reveal_timing`, deshace la de `phase_close` del 14/11): el
// penal — 1ª fase y 2ª chance — se resuelve SOLO al vencer su deadline, aunque hayan respondido todos.
// Así nadie ve el resultado antes de tiempo. Vale en todos los modos (humanos y bots).
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

describe("regla de fase: se resuelve solo al vencer el tiempo", () => {
  it("dos humanos responden → sigue abierto (too_early) hasta el deadline; ahí resuelve", async () => {
    await withRollback(async (c) => {
      const fx = await makeMatchFixture(c);
      const penalty = await openManualPenalty(c, fx.matchId, fx.pA, fx.pB, 1);
      const ok = await correctOf(c, penalty);
      await answer(c, fx.userA, penalty, ok);
      await answer(c, fx.userB, penalty, (ok + 1) % 3);
      expect(await status(c, penalty)).toBe("open");

      await c.query("savepoint sp");
      await expect(c.query("select public.resolve_penalty($1)", [penalty])).rejects.toThrow(/too_early/);
      await c.query("rollback to savepoint sp");
      await c.query("select public.tick()"); // el cron tampoco lo adelanta
      expect(await status(c, penalty)).toBe("open");

      await c.query(`update public.penalties set deadline = now() - interval '1 second' where id = $1`, [penalty]);
      await c.query("select public.tick()");
      const { rows } = await c.query<{ status: string; winner: string }>(
        "select status, resolution ->> 'winner' as winner from public.penalties where id = $1",
        [penalty],
      );
      expect(rows[0]).toEqual({ status: "resolved", winner: "kicker" });
    });
  });

  it("si falta una respuesta, igual: al vencer resuelve (el que no respondió recibe una al azar)", async () => {
    await withRollback(async (c) => {
      const fx = await makeMatchFixture(c);
      const penalty = await openManualPenalty(c, fx.matchId, fx.pA, fx.pB, 1);
      await answer(c, fx.userA, penalty, 0);
      await c.query("select public.tick()");
      expect(await status(c, penalty)).toBe("open");
      await c.query(`update public.penalties set deadline = now() - interval '1 second' where id = $1`, [penalty]);
      await c.query("select public.tick()");
      expect(await status(c, penalty)).not.toBe("open");
    });
  });

  it("humano + bot: aunque el bot ya actuó, espera el deadline", async () => {
    await withRollback(async (c) => {
      const fx = await makeMatchFixture(c);
      await c.query("update public.participants set is_bot = true, user_id = null where id = $1", [fx.pB]);
      const penalty = await openManualPenalty(c, fx.matchId, fx.pA, fx.pB, 1);
      const ok = await correctOf(c, penalty);
      await answer(c, fx.userA, penalty, ok);
      await c.query(
        `insert into public.bot_intents (penalty_id, participant_id, phase, scheduled_answer_at, will_be_correct, chosen_option)
         values ($1, $2, 'first', now() - interval '1 second', true, $3)`,
        [penalty, fx.pB, ok],
      );
      await c.query("select public.tick()"); // materializa al bot, no resuelve
      expect(await status(c, penalty)).toBe("open");
      const { rows } = await c.query<{ n: string }>(
        "select count(*) n from public.penalty_answers where penalty_id = $1 and phase = 'first'",
        [penalty],
      );
      expect(Number(rows[0]!.n)).toBe(2);
    });
  });

  it("la 2ª chance también espera su deadline", async () => {
    await withRollback(async (c) => {
      const fx = await makeMatchFixture(c);
      const penalty = await openManualPenalty(c, fx.matchId, fx.pA, fx.pB, 1);
      const ok = await correctOf(c, penalty);
      await answer(c, fx.userA, penalty, (ok + 1) % 3);
      await answer(c, fx.userB, penalty, (ok + 2) % 3);
      expect(await status(c, penalty)).toBe("open");
      await c.query(`update public.penalties set deadline = now() - interval '1 second' where id = $1`, [penalty]);
      await c.query("select public.tick()");
      expect(await status(c, penalty)).toBe("second_chance");

      await answer(c, fx.userA, penalty, ok);
      await answer(c, fx.userB, penalty, ok);
      await c.query("select public.tick()");
      expect(await status(c, penalty)).toBe("second_chance");
      await c.query(`update public.penalties set deadline = now() - interval '1 second' where id = $1`, [penalty]);
      await c.query("select public.tick()");
      expect(await status(c, penalty)).toBe("resolved");
    });
  });
});
