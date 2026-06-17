// 8.5 — get_bracket / get_active_tournament: foto inicial del bracket + gate de la pantalla de
// torneo. Solo para miembros; nada sensible (sin correct_index). Usa un torneo real (matchmaking +
// start_tournament) para tener 48 participantes + 72 matches de grupo.
import { afterAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { closePool, withRollback, asRole, resetRole } from "./_db";
import { startRealTournament } from "./_fixtures";

afterAll(closePool);

type Bracket = {
  tournament_id: string;
  my_participant_id: string | null;
  current_phase: string;
  participants: Array<{ participant_id: string; group_letter: string | null }>;
  matches: Array<{ match_id: string; phase: string }>;
};

describe("get_bracket", () => {
  it("devuelve 48 participantes + 72 matches de grupo + mi participante a un miembro", async () => {
    await withRollback(async (c) => {
      const { tournamentId, users } = await startRealTournament(c, 3);

      await asRole(c, "authenticated", users[0]!);
      const { rows } = await c.query<{ b: Bracket }>(
        "select public.get_bracket($1) as b",
        [tournamentId],
      );
      await resetRole(c);

      const b = rows[0]!.b;
      expect(b.tournament_id).toBe(tournamentId);
      expect(b.current_phase).toBe("groups");
      expect(b.participants).toHaveLength(48);
      expect(b.matches.filter((m) => m.phase === "group")).toHaveLength(72);
      expect(b.my_participant_id).toBeTruthy();
      expect(JSON.stringify(b)).not.toContain("correct_index");
    });
  });

  it("rechaza a un no-miembro con not_tournament_member", async () => {
    await withRollback(async (c) => {
      const { tournamentId } = await startRealTournament(c, 2);

      await asRole(c, "authenticated", randomUUID());
      await expect(
        c.query("select public.get_bracket($1)", [tournamentId]),
      ).rejects.toThrow(/not_tournament_member/);
    });
  });
});

describe("get_active_tournament", () => {
  it("devuelve el torneo en curso del caller (no eliminado)", async () => {
    await withRollback(async (c) => {
      const { tournamentId, users } = await startRealTournament(c, 2);

      await asRole(c, "authenticated", users[0]!);
      const { rows } = await c.query<{ t: { tournament_id: string } | null }>(
        "select public.get_active_tournament() as t",
      );
      await resetRole(c);

      expect(rows[0]!.t?.tournament_id).toBe(tournamentId);
    });
  });

  it("null para quien no juega ningún torneo", async () => {
    await withRollback(async (c) => {
      await startRealTournament(c, 2);

      await asRole(c, "authenticated", randomUUID());
      const { rows } = await c.query<{ t: unknown }>(
        "select public.get_active_tournament() as t",
      );
      await resetRole(c);

      expect(rows[0]!.t).toBeNull();
    });
  });
});
