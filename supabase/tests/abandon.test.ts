// 9.0(c) — Abandonar (5.4): el humano que abandona pasa a BOT (is_bot=true, juega por intent con el
// tier de su nación, NO random), `get_active_match` deja de rehidratarlo, y sus penales se resuelven
// por el bot (is_random=false). (Desconexión ≠ abandono: la desconexión sí es random, §3.1.)
import { afterAll, describe, expect, it } from "vitest";
import { closePool, withRollback, asRole, resetRole } from "./_db";
import { makeMatchFixture, openManualPenalty } from "./_fixtures";

afterAll(closePool);

describe("abandon: humano → bot", () => {
  it("pasa a bot, deja de rehidratar y resuelve por intent (no random)", async () => {
    await withRollback(async (c) => {
      const fx = await makeMatchFixture(c);
      const penaltyId = await openManualPenalty(c, fx.matchId, fx.pA, fx.pB);

      // Antes de abandonar: get_active_match rehidrata el partido con el penal abierto.
      await asRole(c, "authenticated", fx.userA);
      const before = (
        await c.query<{ am: { match_id: string; penal: unknown } | null }>(
          "select public.get_active_match() as am",
        )
      ).rows[0]!.am;
      expect(before).not.toBeNull();
      expect(before!.match_id).toBe(fx.matchId);
      expect(before!.penal).not.toBeNull();

      // userA abandona (entra por match).
      await c.query("select public.abandon($1)", [fx.matchId]);

      // get_active_match ya NO lo rehidrata (su participante es bot).
      const after = (
        await c.query<{ am: unknown | null }>("select public.get_active_match() as am")
      ).rows[0]!.am;
      expect(after).toBeNull();
      await resetRole(c);

      // El participante quedó como bot y se le precomputó un intent en el penal abierto.
      const pa = (
        await c.query<{ is_bot: boolean }>(
          "select is_bot from public.participants where id = $1",
          [fx.pA],
        )
      ).rows[0]!;
      expect(pa.is_bot).toBe(true);

      const intent = (
        await c.query<{ n: string }>(
          "select count(*) n from public.bot_intents where penalty_id = $1 and participant_id = $2",
          [penaltyId, fx.pA],
        )
      ).rows[0]!;
      expect(Number(intent.n)).toBe(1);

      // Al resolver (deadline vencido, poke de cron uid null), el ahora-bot juega por su intent.
      await c.query(
        "update public.penalties set deadline = now() - interval '1 second' where id = $1",
        [penaltyId],
      );
      await c.query("select public.resolve_penalty($1)", [penaltyId]);

      const ans = (
        await c.query<{ is_random: boolean }>(
          `select is_random from public.penalty_answers
            where penalty_id = $1 and participant_id = $2 and phase = 'first'`,
          [penaltyId, fx.pA],
        )
      ).rows[0]!;
      expect(ans.is_random).toBe(false); // bot por intent, no aleatorio
    });
  });
});
