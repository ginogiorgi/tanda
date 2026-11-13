// Tanda 2.0 — E2E del modo Fútbol Argentino por el camino autoritativo SQL: 30 equipos en 2 zonas
// de 15, 5 fechas (7 partidos por zona + 1 interzonal de los libres por fecha), pasan 8 por zona a
// octavos, sin 3er puesto. Verifica formato, invariantes de cruces y catálogo por modo.
import { afterAll, describe, expect, it } from "vitest";
import { closePool, withRollback } from "./_db";
import { enableArgMode, startRealTournament } from "./_fixtures";
import { driveTournament } from "./_drive";

afterAll(closePool);

describe("torneo Argentina 2 humanos + 28 bots → campeón", () => {
  it(
    "zonas de 15 + interzonales → octavos → campeón, sin 3er puesto",
    async () => {
      await withRollback(async (c) => {
        await enableArgMode(c);
        const { tournamentId } = await startRealTournament(c, 2, "arg");

        const rounds = await driveTournament(c, tournamentId);
        expect(rounds).toBeGreaterThanOrEqual(0);

        const t = (
          await c.query<{ status: string; mode_id: string; champion: string | null; third: string | null }>(
            `select status, mode_id, champion_participant_id champion, third_place_participant_id third
               from public.tournaments where id = $1`,
            [tournamentId],
          )
        ).rows[0]!;
        expect(t.mode_id).toBe("arg");
        expect(t.status).toBe("finished");
        expect(t.champion).not.toBeNull();
        expect(t.third).toBeNull();

        // 30 participantes, 15 por zona, cada uno con un club distinto del modo arg
        const zones = await c.query<{ zone: string; n: string }>(
          `select group_letter zone, count(*) n from public.participants
            where tournament_id = $1 group by 1 order by 1`,
          [tournamentId],
        );
        expect(zones.rows.map((r) => [r.zone, Number(r.n)])).toEqual([
          ["A", 15],
          ["B", 15],
        ]);
        const teams = (
          await c.query<{ n: string; wrong: string }>(
            `select count(distinct p.team_id) n, count(*) filter (where t.mode_id <> 'arg') wrong
               from public.participants p join public.teams t on t.id = p.team_id
              where p.tournament_id = $1`,
            [tournamentId],
          )
        ).rows[0]!;
        expect(Number(teams.n)).toBe(30);
        expect(Number(teams.wrong)).toBe(0);

        // 75 partidos de zona: 70 de zona + 5 interzonales (group_letter null, A vs B)
        const group = (
          await c.query<{ total: string; inter: string; inter_ok: string }>(
            `select count(*) total,
                    count(*) filter (where m.group_letter is null) inter,
                    count(*) filter (where m.group_letter is null and h.group_letter <> a.group_letter) inter_ok
               from public.matches m
               join public.participants h on h.id = m.home_participant_id
               join public.participants a on a.id = m.away_participant_id
              where m.tournament_id = $1 and m.phase = 'group' and m.status = 'finished'`,
            [tournamentId],
          )
        ).rows[0]!;
        expect(Number(group.total)).toBe(75);
        expect(Number(group.inter)).toBe(5);
        expect(Number(group.inter_ok)).toBe(5);

        // Cada equipo juega exactamente 5 partidos de zona
        const perTeam = await c.query<{ n: string }>(
          `select count(*) n from public.participants p
             join public.matches m on m.tournament_id = p.tournament_id and m.phase = 'group'
              and p.id in (m.home_participant_id, m.away_participant_id)
            where p.tournament_id = $1 group by p.id`,
          [tournamentId],
        );
        expect(perTeam.rows.every((r) => Number(r.n) === 5)).toBe(true);

        // KO: octavos 8 + cuartos 4 + semis 2 + final 1 = 15, sin round_of_32 ni third_place
        const ko = await c.query<{ phase: string; n: string }>(
          `select phase::text, count(*) n from public.matches
            where tournament_id = $1 and phase <> 'group' and status = 'finished'
            group by 1`,
          [tournamentId],
        );
        expect(Object.fromEntries(ko.rows.map((r) => [r.phase, Number(r.n)]))).toEqual({
          round_of_16: 8,
          quarters: 4,
          semis: 2,
          final: 1,
        });

        // Octavos: siempre zona A vs zona B
        const r16 = (
          await c.query<{ same: string }>(
            `select count(*) filter (where h.group_letter = a.group_letter) same
               from public.matches m
               join public.participants h on h.id = m.home_participant_id
               join public.participants a on a.id = m.away_participant_id
              where m.tournament_id = $1 and m.phase = 'round_of_16'`,
            [tournamentId],
          )
        ).rows[0]!;
        expect(Number(r16.same)).toBe(0);

        // Todos quedaron ubicados o eliminados; 14 eliminados en zonas
        const placed = (
          await c.query<{ all: string; group_out: string }>(
            `select count(*) filter (where placement is not null or eliminated_phase is not null) all,
                    count(*) filter (where eliminated_phase = 'group') group_out
               from public.participants where tournament_id = $1`,
            [tournamentId],
          )
        ).rows[0]!;
        expect(Number(placed.all)).toBe(30);
        expect(Number(placed.group_out)).toBe(14);

        // Las preguntas salieron del banco del modo
        const qs = (
          await c.query<{ wrong: string }>(
            `select count(*) wrong from public.penalties pe
               join public.matches m on m.id = pe.match_id
               join public.questions q on q.id = pe.question_id
              where m.tournament_id = $1 and q.mode_id <> 'arg'`,
            [tournamentId],
          )
        ).rows[0]!;
        expect(Number(qs.wrong)).toBe(0);
      });
    },
    120_000,
  );

  it("modo inactivo → create_room lo rechaza", async () => {
    await withRollback(async (c) => {
      await c.query("update public.game_modes set active = false where id = 'arg'");
      await expect(startRealTournament(c, 1, "arg")).rejects.toThrow();
    });
  });
});
