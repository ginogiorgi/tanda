// F10 / 10.10 — `get_tournament_history`: el historial del perfil dejó de ser un stub. Verifica que
// la RPC (SECURITY DEFINER, por auth.uid()) devuelve las participaciones del caller con la agregación
// de sus matches finalizados (goles, jugados, ganados) y que cada uno ve SOLO lo suyo.
import { afterAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { closePool, withRollback, asRole, resetRole } from "./_db";
import { makeMatchFixture } from "./_fixtures";

afterAll(closePool);

type HistoryEntry = {
  tournamentId: string;
  nationName: string;
  placement: number | null;
  eliminatedPhase: string | null;
  goalsFor: number;
  matchesPlayed: number;
  matchesWon: number;
  abandoned: boolean;
  playedAt: string;
};

async function history(c: PoolClient, uid: string): Promise<HistoryEntry[]> {
  await asRole(c, "authenticated", uid);
  const { rows } = await c.query<{ h: HistoryEntry[] }>(
    "select public.get_tournament_history() as h",
  );
  await resetRole(c);
  return rows[0]!.h;
}

describe("get_tournament_history (10.10)", () => {
  it("devuelve la participación del caller con goles/jugados/ganados; cada uno ve lo suyo", async () => {
    await withRollback(async (c) => {
      const fx = await makeMatchFixture(c);
      // El match del fixture: pA (home) vs pB (away). Lo cerramos 2-1 a favor de pA.
      await c.query(
        `update public.matches
            set status = 'finished', home_score = 2, away_score = 1, winner_participant_id = $2
          where id = $1`,
        [fx.matchId, fx.pA],
      );
      await c.query(
        `update public.participants set eliminated_phase = 'group' where id in ($1, $2)`,
        [fx.pA, fx.pB],
      );

      const histA = await history(c, fx.userA);
      expect(histA).toHaveLength(1);
      const a = histA[0]!;
      expect(a.tournamentId).toBe(fx.tournamentId);
      expect(a.eliminatedPhase).toBe("group");
      expect(a.placement).toBeNull();
      expect(a.matchesPlayed).toBe(1);
      expect(a.matchesWon).toBe(1); // pA ganó
      expect(a.goalsFor).toBe(2); // home_score de pA

      const histB = await history(c, fx.userB);
      expect(histB).toHaveLength(1);
      const b = histB[0]!;
      expect(b.matchesPlayed).toBe(1);
      expect(b.matchesWon).toBe(0); // pB perdió
      expect(b.goalsFor).toBe(1); // away_score de pB
    });
  });

  it("una participación ABANDONADA (is_bot=true, abandoned=true, user_id no nulo) sigue apareciendo", async () => {
    await withRollback(async (c) => {
      const fx = await makeMatchFixture(c);
      await c.query(
        `update public.matches
            set status = 'finished', home_score = 0, away_score = 3, winner_participant_id = $2
          where id = $1`,
        [fx.matchId, fx.pB],
      );
      // Simula el efecto de abandon(): el humano pasa a bot conservando user_id, marcado abandoned.
      await c.query(
        `update public.participants set is_bot = true, abandoned = true where id = $1`,
        [fx.pA],
      );

      const histA = await history(c, fx.userA);
      expect(histA).toHaveLength(1); // antes del fix quedaba fuera por el filtro is_bot=false
      expect(histA[0]!.abandoned).toBe(true);
      expect(histA[0]!.tournamentId).toBe(fx.tournamentId);
    });
  });

  it("un usuario sin torneos ve lista vacía", async () => {
    await withRollback(async (c) => {
      const hist = await history(c, randomUUID());
      expect(hist).toEqual([]);
    });
  });
});
