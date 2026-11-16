// P5 (feedback 2): el perdedor de un cruce queda eliminado al terminar SU partido, no la ronda; el
// subcampeón tiene placement 2 apenas termina la final, aunque el 3er puesto siga.
import type { PoolClient } from "pg";
import { afterAll, describe, expect, it } from "vitest";
import { closePool, createUser, withRollback } from "./_db";
import { makeMatchFixture } from "./_fixtures";

afterAll(closePool);

async function participant(c: PoolClient, tournamentId: string): Promise<string> {
  const uid = await createUser(c, `ko_${Math.random().toString(36).slice(2, 8)}`);
  const { rows } = await c.query<{ id: string }>(
    "insert into public.participants (tournament_id, user_id, is_bot) values ($1, $2, false) returning id",
    [tournamentId, uid],
  );
  return rows[0]!.id;
}

async function koMatch(c: PoolClient, t: string, phase: string, slot: number, home: string, away: string): Promise<string> {
  const { rows } = await c.query<{ id: string }>(
    `insert into public.matches (tournament_id, phase, bracket_slot, home_participant_id, away_participant_id, is_bot_only, status)
     values ($1, $2, $3, $4, $5, false, 'in_progress') returning id`,
    [t, phase, slot, home, away],
  );
  return rows[0]!.id;
}

async function finish(c: PoolClient, match: string, winner: string): Promise<void> {
  await c.query("update public.matches set status = 'finished', winner_participant_id = $2 where id = $1", [match, winner]);
}

async function state(c: PoolClient, p: string): Promise<{ eliminated_phase: string | null; placement: number | null }> {
  return (await c.query("select eliminated_phase, placement from public.participants where id = $1", [p])).rows[0];
}

describe("KO: eliminado al terminar el partido", () => {
  it("perder en octavos marca la fase antes de que terminen los otros octavos", async () => {
    await withRollback(async (c) => {
      const fx = await makeMatchFixture(c);
      const [c1, c2] = [await participant(c, fx.tournamentId), await participant(c, fx.tournamentId)];
      const m1 = await koMatch(c, fx.tournamentId, "round_of_16", 0, fx.pA, fx.pB);
      await koMatch(c, fx.tournamentId, "round_of_16", 1, c1, c2); // sigue en juego
      await finish(c, m1, fx.pA);
      expect(await state(c, fx.pB)).toEqual({ eliminated_phase: "round_of_16", placement: null });
      expect(await state(c, fx.pA)).toEqual({ eliminated_phase: null, placement: null });
      expect(await state(c, c1)).toEqual({ eliminated_phase: null, placement: null });
    });
  });

  it("subcampeón: placement 2 apenas termina la final, con el 3er puesto todavía en juego", async () => {
    await withRollback(async (c) => {
      const fx = await makeMatchFixture(c);
      const [c1, c2] = [await participant(c, fx.tournamentId), await participant(c, fx.tournamentId)];
      const fin = await koMatch(c, fx.tournamentId, "final", 0, fx.pA, fx.pB);
      await koMatch(c, fx.tournamentId, "third_place", 0, c1, c2);
      await finish(c, fin, fx.pB);
      expect(await state(c, fx.pA)).toEqual({ eliminated_phase: "final", placement: 2 });
      expect(await state(c, fx.pB)).toEqual({ eliminated_phase: null, placement: null }); // el campeón, al cerrar
    });
  });

  it("semis con 3er puesto: el perdedor NO queda eliminado (vuelve a jugar)", async () => {
    await withRollback(async (c) => {
      const fx = await makeMatchFixture(c); // Mundial: third_place = true
      const m = await koMatch(c, fx.tournamentId, "semis", 0, fx.pA, fx.pB);
      await finish(c, m, fx.pA);
      expect(await state(c, fx.pB)).toEqual({ eliminated_phase: null, placement: null });
    });
  });

  it("los grupos no marcan nada y re-terminar no pisa", async () => {
    await withRollback(async (c) => {
      const fx = await makeMatchFixture(c); // match de grupo
      await finish(c, fx.matchId, fx.pA);
      expect(await state(c, fx.pB)).toEqual({ eliminated_phase: null, placement: null });
    });
  });
});
