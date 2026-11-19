// Feedback 3 #16 — no repetir preguntas ENTRE torneos, en todos los modos. `take_tournament_question`
// excluye lo que vio cualquier humano del torneo (`user_seen_questions`, que registra
// `open_penalty_internal`), evita sus temas y, con el banco agotado, toma la vista hace más tiempo.
import { afterAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { asRole, closePool, createUser, resetRole, withRollback } from "./_db";
import { enableArgMode, makeMatchFixture } from "./_fixtures";

afterAll(closePool);

type Mode = "worldcup" | "arg" | "ranked";
const DIFFS = ["easy", "medium", "hard"] as const;

/** Torneo del modo con estos humanos como participantes (sin fixture: solo se toman preguntas). */
async function tournamentWith(c: PoolClient, mode: Mode, users: string[], seed: number): Promise<string> {
  const room = (
    await c.query<{ id: string }>(
      `insert into public.rooms (code, host_id, status, starts_at, mode_id)
       values ($1, $2, 'in_progress', now(), $3) returning id`,
      [`S${randomUUID().slice(0, 7).toUpperCase()}`, users[0], mode],
    )
  ).rows[0]!.id;
  const t = (
    await c.query<{ id: string }>(
      `insert into public.tournaments (room_id, status, seed, mode_id) values ($1, 'in_progress', $2, $3) returning id`,
      [room, seed, mode],
    )
  ).rows[0]!.id;
  for (const u of users) {
    await c.query(`insert into public.participants (tournament_id, user_id, is_bot) values ($1, $2, false)`, [t, u]);
  }
  return t;
}

/** Toma `n` preguntas como lo haría el torneo y las marca vistas por `seenBy` (lo que hace abrir el penal). */
async function play(c: PoolClient, t: string, n: number, seenBy: string[]): Promise<{ id: string; topic: string | null }[]> {
  const taken: { id: string; topic: string | null }[] = [];
  for (let i = 0; i < n; i++) {
    const { rows } = await c.query<{ id: string; topic: string | null }>(
      `with t as (select public.take_tournament_question($1, $2::public.difficulty, $3) as id)
       select q.id, q.topic from t join public.questions q on q.id = t.id`,
      [t, DIFFS[i % 3], 7000 + i],
    );
    taken.push(rows[0]!);
    for (const u of seenBy) {
      await c.query(
        `insert into public.user_seen_questions (user_id, question_id) values ($1, $2) on conflict do nothing`,
        [u, rows[0]!.id],
      );
    }
  }
  return taken;
}

function overlap<T>(a: T[], b: T[]): T[] {
  const s = new Set(a);
  return b.filter((x) => s.has(x));
}

describe("preguntas vistas: no se repiten entre torneos", () => {
  for (const mode of ["worldcup", "arg", "ranked"] as const) {
    it(`${mode}: 2 torneos de 45 del mismo humano → 0 preguntas y 0 temas repetidos`, async () => {
      await withRollback(async (c) => {
        await enableArgMode(c);
        const u = await createUser(c, `seen_${randomUUID().slice(0, 6)}`);
        const t1 = await tournamentWith(c, mode, [u], 111);
        const a = await play(c, t1, 45, [u]);
        const t2 = await tournamentWith(c, mode, [u], 111); // misma seed: sin el fix saldría lo mismo
        const b = await play(c, t2, 45, [u]);
        const all = [...a, ...b];
        expect(new Set(all.map((x) => x.id)).size).toBe(90);
        const topics = all.map((x) => x.topic).filter((x): x is string => x !== null);
        expect(new Set(topics).size).toBe(topics.length);
      });
    });
  }

  it("dos humanos: evita lo que vio cualquiera de los dos", async () => {
    await withRollback(async (c) => {
      const a = await createUser(c, `sa_${randomUUID().slice(0, 6)}`);
      const b = await createUser(c, `sb_${randomUUID().slice(0, 6)}`);
      const seenA = (await play(c, await tournamentWith(c, "worldcup", [a], 5), 30, [a])).map((x) => x.id);
      const seenB = (await play(c, await tournamentWith(c, "worldcup", [b], 6), 30, [b])).map((x) => x.id);
      const both = (await play(c, await tournamentWith(c, "worldcup", [a, b], 5), 45, [a, b])).map((x) => x.id);
      expect(overlap(seenA, both)).toEqual([]);
      expect(overlap(seenB, both)).toEqual([]);
    });
  });

  it("invitado (usuario anónimo): igual", async () => {
    await withRollback(async (c) => {
      const g = await createUser(c, `guest_${randomUUID().slice(0, 6)}`);
      await c.query("update auth.users set is_anonymous = true where id = $1", [g]);
      const a = (await play(c, await tournamentWith(c, "worldcup", [g], 9), 40, [g])).map((x) => x.id);
      const b = (await play(c, await tournamentWith(c, "worldcup", [g], 9), 40, [g])).map((x) => x.id);
      expect(overlap(a, b)).toEqual([]);
    });
  });

  it("banco agotado: toma la vista hace más tiempo, sin fallar", async () => {
    await withRollback(async (c) => {
      await enableArgMode(c);
      const u = await createUser(c, `full_${randomUUID().slice(0, 6)}`);
      await c.query(
        `insert into public.user_seen_questions (user_id, question_id, seen_at)
         select $1, id, now() - interval '1 day' from public.questions where mode_id = 'arg'`,
        [u],
      );
      const oldest = (
        await c.query<{ id: string }>(
          `update public.user_seen_questions set seen_at = now() - interval '60 days'
            where user_id = $1 and question_id = (select id from public.questions
              where mode_id = 'arg' and difficulty = 'hard' order by id limit 1)
          returning question_id id`,
          [u],
        )
      ).rows[0]!.id;
      const t = await tournamentWith(c, "arg", [u], 3);
      const { rows } = await c.query<{ id: string }>(
        `select public.take_tournament_question($1, 'very_hard', 1) id`,
        [t],
      );
      expect(rows[0]!.id).toBe(oldest);
    });
  });

  it("abrir el penal registra al pateador y al arquero humanos", async () => {
    await withRollback(async (c) => {
      const f = await makeMatchFixture(c);
      const pen = (
        await c.query<{ id: string; question_id: string }>(
          `insert into public.penalties (match_id, idx, kicker_participant_id, keeper_participant_id, question_id, difficulty, status)
           values ($1, 1, $2, $3, (select id from public.questions where difficulty = 'easy' limit 1), 'easy', 'pending')
           returning id, question_id`,
          [f.matchId, f.pA, f.pB],
        )
      ).rows[0]!;
      await c.query("select public.open_penalty_internal($1)", [pen.id]);
      const { rows } = await c.query<{ user_id: string }>(
        "select user_id from public.user_seen_questions where question_id = $1 order by user_id",
        [pen.question_id],
      );
      expect(rows.map((r) => r.user_id)).toEqual([f.userA, f.userB].sort());
    });
  });

  it("el cliente no tiene privilegios sobre la tabla", async () => {
    await withRollback(async (c) => {
      const u = await createUser(c, `rls_${randomUUID().slice(0, 6)}`);
      for (const role of ["anon", "authenticated"] as const) {
        await c.query("savepoint s");
        await asRole(c, role, u);
        await expect(c.query("select * from public.user_seen_questions")).rejects.toThrow(/permission denied/);
        await c.query("rollback to savepoint s");
        await resetRole(c);
      }
    });
  });
});
