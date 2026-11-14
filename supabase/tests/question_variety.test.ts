// Fase 5 — `take_tournament_question` prefiere un tema que no salió en el torneo (ni la misma
// pregunta reescrita ni una que regale la respuesta de otra) y una categoría distinta de la última.
import { afterAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { closePool, withRollback } from "./_db";

afterAll(closePool);

async function tournament(c: PoolClient, mode: string): Promise<string> {
  const room = randomUUID();
  await c.query(
    `insert into public.rooms (id, code, status, starts_at, mode_id) values ($1, $2, 'in_progress', now(), $3)`,
    [room, `T${room.slice(0, 5).toUpperCase()}`, mode],
  );
  const { rows } = await c.query<{ id: string }>(
    `insert into public.tournaments (room_id, seed, mode_id) values ($1, 4242, $2) returning id`,
    [room, mode],
  );
  return rows[0]!.id;
}

describe("take_tournament_question: variedad", () => {
  for (const mode of ["worldcup", "arg"]) {
    it(`${mode}: no repite tema ni categoría consecutiva`, async () => {
      await withRollback(async (c) => {
        const t = await tournament(c, mode);
        const taken: { topic: string | null; category: string }[] = [];
        for (let i = 0; i < 40; i++) {
          const diff = (["easy", "medium", "hard"] as const)[i % 3];
          const { rows } = await c.query<{ topic: string | null; category: string }>(
            `with t as (select public.take_tournament_question($1, $2::public.difficulty, $3) as id)
             select q.topic, q.category from t join public.questions q on q.id = t.id`,
            [t, diff, 1000 + i],
          );
          taken.push(rows[0]!);
        }
        const topics = taken.map((x) => x.topic).filter((x): x is string => x !== null);
        expect(new Set(topics).size).toBe(topics.length);
        for (let i = 1; i < taken.length; i++) expect(taken[i]!.category).not.toBe(taken[i - 1]!.category);
      });
    });
  }
});
