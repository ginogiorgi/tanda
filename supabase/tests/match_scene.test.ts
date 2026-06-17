// 8.2 — get_match_scene: datos estáticos de la escena 3D (briefs de nación + avatares + rol del
// caller). Solo para miembros del match; nada sensible (sin correct_index). Espejo de las garantías
// del anti-trampa (9.0e): un no-miembro no puede leerla.
import { afterAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { closePool, withRollback, asRole, resetRole } from "./_db";
import { makeMatchFixture, openManualPenalty } from "./_fixtures";

afterAll(closePool);

type Scene = {
  match_id: string;
  my_participant_id: string | null;
  home: { participant_id: string } | null;
  away: { participant_id: string } | null;
  home_avatar: unknown;
  away_avatar: unknown;
};

describe("get_match_scene", () => {
  it("devuelve briefs + mi participante a un miembro del match", async () => {
    await withRollback(async (c) => {
      const fx = await makeMatchFixture(c);

      await asRole(c, "authenticated", fx.userA);
      const { rows } = await c.query<{ scene: Scene }>(
        "select public.get_match_scene($1) as scene",
        [fx.matchId],
      );
      await resetRole(c);

      const scene = rows[0]!.scene;
      expect(scene.match_id).toBe(fx.matchId);
      expect(scene.my_participant_id).toBe(fx.pA);
      expect(scene.home?.participant_id).toBe(fx.pA);
      expect(scene.away?.participant_id).toBe(fx.pB);
      // No filtra nada sensible: el payload no tiene correct_index.
      expect(JSON.stringify(scene)).not.toContain("correct_index");
    });
  });

  it("rechaza a un no-miembro con not_match_member", async () => {
    await withRollback(async (c) => {
      const fx = await makeMatchFixture(c);
      const stranger = randomUUID();

      await asRole(c, "authenticated", stranger);
      // Tras el throw la transacción queda abortada → no reseteamos rol acá; withRollback limpia.
      await expect(
        c.query("select public.get_match_scene($1)", [fx.matchId]),
      ).rejects.toThrow(/not_match_member/);
    });
  });
});

describe("get_match_penals", () => {
  it("devuelve los penales resueltos (idx/kicker/scored) a un miembro; rechaza al ajeno", async () => {
    await withRollback(async (c) => {
      const fx = await makeMatchFixture(c);
      await c.query(
        `insert into public.penalties
           (match_id, idx, kicker_participant_id, keeper_participant_id, question_id,
            difficulty, status, resolution)
         values ($1, 1, $2, $3,
            (select id from public.questions where difficulty = 'easy' limit 1),
            'easy', 'resolved',
            jsonb_build_object('scored', true, 'winner', 'kicker', 'reason', 'goal'))`,
        [fx.matchId, fx.pA, fx.pB],
      );

      await asRole(c, "authenticated", fx.userA);
      const { rows } = await c.query<{ p: Array<{ idx: number; scored: boolean }> }>(
        "select public.get_match_penals($1) as p",
        [fx.matchId],
      );
      await resetRole(c);
      expect(rows[0]!.p).toHaveLength(1);
      expect(rows[0]!.p[0]!.scored).toBe(true);

      await asRole(c, "authenticated", randomUUID());
      await expect(
        c.query("select public.get_match_penals($1)", [fx.matchId]),
      ).rejects.toThrow(/not_match_member/);
    });
  });
});

describe("get_active_match: kicker/keeper sin filtrar correct_index", () => {
  it("incluye kicker/keeper del penal abierto y nunca correct_index", async () => {
    await withRollback(async (c) => {
      const fx = await makeMatchFixture(c);
      await openManualPenalty(c, fx.matchId, fx.pA, fx.pB, 1);

      await asRole(c, "authenticated", fx.userA);
      const { rows } = await c.query<{ am: { penal: Record<string, unknown> | null } }>(
        "select public.get_active_match() as am",
      );
      await resetRole(c);

      const penal = rows[0]!.am.penal!;
      expect(penal.kicker_participant_id).toBe(fx.pA);
      expect(penal.keeper_participant_id).toBe(fx.pB);
      expect(Object.keys(penal)).not.toContain("correct_index");
    });
  });
});
