// 9.0(a) — E2E del torneo entero por el camino autoritativo SQL: start_tournament → driver
// (vencer deadlines + tick/open_next_round) → campeón + 3er puesto. Verifica las invariantes que
// los E2E manuales (ya borrados) chequeaban a mano. Reproducible (seed del torneo fijo en la DB).
import { afterAll, describe, expect, it } from "vitest";
import { closePool, withRollback } from "./_db";
import { startRealTournament } from "./_fixtures";
import { driveTournament } from "./_drive";

afterAll(closePool);

describe("torneo completo 2 humanos + 46 bots → campeón", () => {
  it(
    "corre grupos → KO → campeón + 3º con todas las invariantes",
    async () => {
      await withRollback(async (c) => {
        const { tournamentId } = await startRealTournament(c, 2);

        const rounds = await driveTournament(c, tournamentId);
        expect(rounds).toBeGreaterThanOrEqual(0); // -1 = no terminó (trabado)

        const t = (
          await c.query<{
            status: string;
            champion: string | null;
            third: string | null;
          }>(
            `select status, champion_participant_id champion, third_place_participant_id third
               from public.tournaments where id = $1`,
            [tournamentId],
          )
        ).rows[0]!;
        expect(t.status).toBe("finished");
        expect(t.champion).not.toBeNull();
        expect(t.third).not.toBeNull();

        // 48 participantes, 12 grupos de 4, 72 partidos de grupo finished
        const counts = (
          await c.query<{ participants: string; groups: string; group_matches: string }>(
            `select
               (select count(*) from public.participants where tournament_id = $1) participants,
               (select count(distinct group_letter) from public.participants
                  where tournament_id = $1 and group_letter is not null) groups,
               (select count(*) from public.matches
                  where tournament_id = $1 and phase = 'group' and status = 'finished') group_matches`,
            [tournamentId],
          )
        ).rows[0]!;
        expect(Number(counts.participants)).toBe(48);
        expect(Number(counts.groups)).toBe(12);
        expect(Number(counts.group_matches)).toBe(72);

        // 32 partidos de eliminación (R32 16 + R16 8 + QF 4 + SF 2 + 3º 1 + final 1)
        const ko = (
          await c.query<{ n: string }>(
            `select count(*) n from public.matches
              where tournament_id = $1 and phase <> 'group' and status = 'finished'`,
            [tournamentId],
          )
        ).rows[0]!;
        expect(Number(ko.n)).toBe(32);

        // Todos los 48 quedaron clasificados (placement 1-4) o eliminados en alguna fase
        const placed = (
          await c.query<{ n: string }>(
            `select count(*) n from public.participants
              where tournament_id = $1 and (placement is not null or eliminated_phase is not null)`,
            [tournamentId],
          )
        ).rows[0]!;
        expect(Number(placed.n)).toBe(48);

        // Invariante anti-bug: NINGÚN cruce de R32 es entre participantes del mismo grupo
        const sameGroup = (
          await c.query<{ n: string }>(
            `select count(*) n from public.matches m
               join public.participants h on h.id = m.home_participant_id
               join public.participants a on a.id = m.away_participant_id
              where m.tournament_id = $1 and m.phase = 'round_of_32'
                and h.group_letter = a.group_letter`,
            [tournamentId],
          )
        ).rows[0]!;
        expect(Number(sameGroup.n)).toBe(0);
      });
    },
    120_000,
  );

  it(
    "build_knockout nunca cruza a dos del mismo grupo en 16avos (300 seeds sobre el mismo torneo)",
    async () => {
      await withRollback(async (c) => {
        // Antes era un greedy que según el seed dejaba un cruce del mismo grupo (el "flake" de arriba).
        const { tournamentId } = await startRealTournament(c, 2);
        expect(await driveTournament(c, tournamentId)).toBeGreaterThanOrEqual(0);
        await c.query(`delete from public.matches where tournament_id = $1 and phase <> 'group'`, [tournamentId]);
        const bad: number[] = [];
        for (let seed = 1; seed <= 300; seed++) {
          await c.query(`delete from public.matches where tournament_id = $1 and phase = 'round_of_32'`, [tournamentId]);
          await c.query(`update public.tournaments set seed = $2 where id = $1`, [tournamentId, seed * 7919]);
          await c.query(`select public.build_knockout($1)`, [tournamentId]);
          const r = (
            await c.query<{ n: string; same: string }>(
              `select count(*) n, count(*) filter (where h.group_letter = a.group_letter) same
                 from public.matches m
                 join public.participants h on h.id = m.home_participant_id
                 join public.participants a on a.id = m.away_participant_id
                where m.tournament_id = $1 and m.phase = 'round_of_32'`,
              [tournamentId],
            )
          ).rows[0]!;
          expect(Number(r.n)).toBe(16);
          if (Number(r.same) > 0) bad.push(seed);
        }
        expect(bad).toEqual([]);
      });
    },
    120_000,
  );

  it("correct_index nunca viaja en penal:start ni score:live; sí en penal:result", async () => {
    await withRollback(async (c) => {
      const { tournamentId } = await startRealTournament(c, 2);
      await driveTournament(c, tournamentId);

      // Todos los broadcasts emitidos durante el torneo, agrupados por evento.
      const rows = await c.query<{ event: string; has_ci: boolean }>(
        `select event, (payload ? 'correct_index') as has_ci
           from realtime.messages
          where extension = 'broadcast'`,
      );
      const startEvents = rows.rows.filter(
        (r) => r.event === "penal:start" || r.event === "score:live",
      );
      const resultEvents = rows.rows.filter((r) => r.event === "penal:result");

      // Hubo broadcasts de ambos tipos y ninguno de los "abiertos" filtró la correcta.
      expect(startEvents.length).toBeGreaterThan(0);
      expect(startEvents.every((r) => r.has_ci === false)).toBe(true);
      // penal:result sí la lleva (el penal ya está resuelto).
      expect(resultEvents.length).toBeGreaterThan(0);
      expect(resultEvents.every((r) => r.has_ci === true)).toBe(true);
    });
  });
});
