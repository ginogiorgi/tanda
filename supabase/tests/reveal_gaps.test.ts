// Feedback 3 #2 / #12 — huecos medidos (ya hubo un bug que llevó el hueco entre tandas a 10 s). En un
// torneo ENTERO (y en una ranked) se fuerza cada deadline y, tras cada vuelta del cron, se mide el
// `round_deadline` que dejó la resolución: dentro de un partido = `betweenPenalsS` exacto (incluye 2ª
// chance y muerte súbita) y al terminar los partidos humanos de la ronda = `betweenMatchesS` (o una
// pausa de fase, que tiene su propia key). Como `now()` es fijo en la transacción, la medida es exacta
// y no puede acumular drift: cada hueco se ancla a la resolución, no al hueco anterior.
import { afterAll, describe, expect, it } from "vitest";
import type { PoolClient } from "pg";
import { TIMING } from "@/lib/engine/timing";
import { closePool, createUser, withRollback } from "./_db";
import { enableArgMode, startRealTournament } from "./_fixtures";

afterAll(closePool);

interface Gaps {
  inMatch: number[];
  afterMatches: number[];
  other: number[];
}

async function driveMeasuring(c: PoolClient, t: string): Promise<Gaps> {
  const g: Gaps = { inMatch: [], afterMatches: [], other: [] };
  const allowedOther = new Set<number>(
    [TIMING.groupsCloseS, TIMING.bracketLeadInS, TIMING.koGapS, TIMING.presentationS, TIMING.presentationBackstopS, TIMING.rankedVersusS],
  );
  for (let i = 0; i < 600; i++) {
    const st = await c.query<{ status: string }>("select status from public.tournaments where id = $1", [t]);
    if (st.rows[0]!.status === "finished") return g;
    const resolving = await c.query(
      `update public.penalties pe set deadline = now() - interval '1 second'
         from public.matches m where m.id = pe.match_id and m.tournament_id = $1
          and pe.status in ('open', 'second_chance') returning pe.id`,
      [t],
    );
    if (resolving.rowCount === 0) {
      await c.query("update public.tournaments set round_deadline = now() - interval '1 second' where id = $1 and round_deadline is not null", [t]);
    }
    await c.query("select public.tick()");
    if (resolving.rowCount === 0) continue;
    // Recién resuelta una ronda: ¿qué hueco dejó el server?
    const { rows } = await c.query<{ gap: number | null; open: boolean; live: boolean }>(
      `select extract(epoch from t.round_deadline - now())::float8 gap,
              exists (select 1 from public.penalties pe join public.matches m on m.id = pe.match_id
                       where m.tournament_id = t.id and not m.is_bot_only and pe.status in ('open','second_chance')) open,
              exists (select 1 from public.matches m where m.tournament_id = t.id and not m.is_bot_only
                       and m.status in ('in_progress','sudden_death')) live
         from public.tournaments t where t.id = $1`,
      [t],
    );
    const r = rows[0]!;
    if (r.open || r.gap === null) continue; // 2ª chance abierta: no hay hueco todavía
    const gap = Math.round(r.gap * 1000) / 1000;
    if (r.live) g.inMatch.push(gap);
    else if (gap === TIMING.betweenMatchesS) g.afterMatches.push(gap);
    else {
      expect(allowedOther.has(gap), `hueco inesperado ${gap}s`).toBe(true);
      g.other.push(gap);
    }
  }
  throw new Error("el torneo no terminó");
}

describe("huecos entre penales y entre partidos (medidos)", () => {
  for (const mode of ["worldcup", "arg"] as const) {
    it(`${mode}: torneo entero → cada hueco intra-partido = betweenPenalsS exacto`, async () => {
      await withRollback(async (c) => {
        if (mode === "arg") await enableArgMode(c);
        const { tournamentId } = await startRealTournament(c, 1, mode);
        const g = await driveMeasuring(c, tournamentId);
        expect(g.inMatch.length).toBeGreaterThan(10);
        expect(new Set(g.inMatch)).toEqual(new Set([TIMING.betweenPenalsS]));
        expect(g.afterMatches.length).toBeGreaterThanOrEqual(3); // 3 (o 5) fechas de grupos
      });
    }, 120_000);
  }

  it("ranked: tanda completa (con muerte súbita si toca) → betweenPenalsS exacto", async () => {
    await withRollback(async (c) => {
      const a = await createUser(c, "gap_a");
      const b = await createUser(c, "gap_b");
      const { rows } = await c.query<{ t: string }>("select public.ranked_create_match($1, $2) t", [a, b]);
      const g = await driveMeasuring(c, rows[0]!.t);
      expect(g.inMatch.length).toBeGreaterThanOrEqual(4); // la tanda puede definirse antes de los 10 penales
      expect(new Set(g.inMatch)).toEqual(new Set([TIMING.betweenPenalsS]));
    });
  });
});
