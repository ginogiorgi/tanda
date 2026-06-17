// 9.0(b) — Reloj de ronda compartido (4.6). N humanos en grupos distintos: al abrir la jornada 1,
// los penales de la misma ronda de TODOS los matches con humanos se abren juntos en una transacción
// → comparten UN solo `deadline`. Es la garantía de sincronización entre humanos.
import { afterAll, describe, expect, it } from "vitest";
import { closePool, withRollback } from "./_db";
import { startRealTournament } from "./_fixtures";

afterAll(closePool);

describe("reloj de ronda compartido", () => {
  it("los penales de la ronda 1 de matches con humanos comparten un solo deadline", async () => {
    await withRollback(async (c) => {
      const { tournamentId } = await startRealTournament(c, 3);

      // Penales abiertos de matches con humano (no bot-only) recién abierta la jornada 1.
      const rows = await c.query<{
        deadline: string;
        group_letter: string;
        match_id: string;
      }>(
        `select pe.deadline::text as deadline, m.group_letter, m.id as match_id
           from public.penalties pe
           join public.matches m on m.id = pe.match_id
          where m.tournament_id = $1 and not m.is_bot_only
            and pe.status in ('open', 'second_chance')`,
        [tournamentId],
      );

      // Hay ≥2 matches con humanos, en grupos distintos…
      const groups = new Set(rows.rows.map((r) => r.group_letter));
      expect(rows.rows.length).toBeGreaterThanOrEqual(2);
      expect(groups.size).toBeGreaterThanOrEqual(2);

      // …y TODOS sus penales comparten exactamente un deadline (reloj de ronda).
      const deadlines = new Set(rows.rows.map((r) => r.deadline));
      expect(deadlines.size).toBe(1);
    });
  });
});
