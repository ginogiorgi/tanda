// Premios del perfil (feedback 14/11): "el perfil muestra 3 logros del Clausura 2026 y ni terminó".
// Regla: UN premio por competencia y SOLO cuando terminó. Los torneos dan oro/plata/bronce al pasar a
// `finished` (constraint trigger diferido → en el test se fuerza con `set constraints all immediate`,
// porque `withRollback` nunca commitea); las temporadas ranked dan la división FINAL al cerrarse.
import type { PoolClient } from "pg";
import { afterAll, describe, expect, it } from "vitest";
import { asRole, closePool, resetRole, withRollback } from "./_db";
import { driveTournament } from "./_drive";
import { makeMatchFixture, startRealTournament } from "./_fixtures";

afterAll(closePool);

interface Stats {
  seasons: { season_id: string; division: string }[];
  current: { season_id: string; division: string; games: number } | null;
  cups: Record<string, { gold: number; silver: number; bronze: number }>;
  divisions: unknown[];
}

async function stats(c: PoolClient, uid: string): Promise<Stats> {
  await asRole(c, "authenticated", uid);
  const { rows } = await c.query<{ r: Stats }>("select public.get_profile_stats() as r");
  await resetRole(c);
  return rows[0]!.r;
}

async function awardsOf(c: PoolClient, uid: string): Promise<{ competition_id: string; award: string }[]> {
  const { rows } = await c.query<{ competition_id: string; award: string }>(
    "select competition_id, award from public.awards where user_id = $1 order by competition_id",
    [uid],
  );
  return rows;
}

/** Cierra el torneo como lo hacen las RPC (posiciones + status) y dispara los triggers diferidos. */
async function finish(c: PoolClient, tournamentId: string): Promise<void> {
  await c.query("update public.tournaments set status = 'finished' where id = $1", [tournamentId]);
  await c.query("set constraints all immediate");
}

describe("awards: un premio por competencia, solo al terminar", () => {
  it("(a) temporada en curso con pico alto → ningún premio ranked; aparece como 'en juego'", async () => {
    await withRollback(async (c) => {
      const fx = await makeMatchFixture(c);
      await c.query("select public.ranked_roll_season(null)");
      const season = (await c.query<{ id: string }>("select public.ranked_season_id(now()) as id")).rows[0]!.id;
      await c.query(
        `insert into public.ranked_players (user_id, rating, season_id, season_games, season_wins, season_peak)
         values ($1, 1532, $2, 1, 1, 1532)`,
        [fx.userA, season],
      );
      const s = await stats(c, fx.userA);
      expect(s.seasons).toEqual([]);
      expect(s.current).toEqual({ season_id: season, division: "ascenso", games: 1 });
      expect(await awardsOf(c, fx.userA)).toEqual([]);
    });
  });

  it("(b) eliminado en semis con el torneo en curso → 0; al terminar → exactamente 1 bronce", async () => {
    await withRollback(async (c) => {
      const fx = await makeMatchFixture(c);
      await c.query("update public.participants set eliminated_phase = 'semis' where id = $1", [fx.pA]);
      await c.query("set constraints all immediate");
      expect(await awardsOf(c, fx.userA)).toEqual([]);
      expect((await stats(c, fx.userA)).cups.worldcup).toEqual({ gold: 0, silver: 0, bronze: 0 });

      await c.query("update public.participants set placement = 1 where id = $1", [fx.pB]);
      await finish(c, fx.tournamentId);
      expect(await awardsOf(c, fx.userA)).toEqual([{ competition_id: fx.tournamentId, award: "bronze" }]);
      expect((await stats(c, fx.userA)).cups.worldcup).toEqual({ gold: 0, silver: 0, bronze: 1 });
      expect((await stats(c, fx.userB)).cups.worldcup).toEqual({ gold: 1, silver: 0, bronze: 0 });
    });
  });

  it("(c) cerrar la temporada → 1 premio con la división FINAL (no el pico)", async () => {
    await withRollback(async (c) => {
      const fx = await makeMatchFixture(c);
      await c.query(
        "insert into public.ranked_seasons values ('apertura-2020', 'Apertura 2020', '2020-01-01', '2020-07-01')",
      );
      await c.query(
        `insert into public.ranked_players (user_id, rating, season_id, season_games, season_wins, season_peak)
         values ($1, 1610, 'apertura-2020', 10, 6, 1780)`,
        [fx.userA],
      );
      await c.query("select public.ranked_roll_season(null)");
      expect(await awardsOf(c, fx.userA)).toEqual([{ competition_id: "apertura-2020", award: "primera" }]);
      expect((await stats(c, fx.userA)).seasons).toEqual([{ season_id: "apertura-2020", division: "primera" }]);
    });
  });

  it("(d) re-disparar el cierre (torneo o temporada) no duplica", async () => {
    await withRollback(async (c) => {
      const fx = await makeMatchFixture(c);
      await c.query("update public.participants set placement = case when id = $1 then 1 else 2 end where tournament_id = $2", [
        fx.pA,
        fx.tournamentId,
      ]);
      await finish(c, fx.tournamentId);
      await c.query("select public.award_tournament($1)", [fx.tournamentId]);
      await c.query("update public.tournaments set status = 'in_progress' where id = $1", [fx.tournamentId]);
      await finish(c, fx.tournamentId);
      expect(await awardsOf(c, fx.userA)).toEqual([{ competition_id: fx.tournamentId, award: "gold" }]);
      expect(await awardsOf(c, fx.userB)).toEqual([{ competition_id: fx.tournamentId, award: "silver" }]);

      await c.query(
        "insert into public.ranked_seasons values ('apertura-2020', 'Apertura 2020', '2020-01-01', '2020-07-01')",
      );
      await c.query(
        `insert into public.ranked_players (user_id, rating, season_id, season_games, season_wins, season_peak)
         values ($1, 1500, 'apertura-2020', 3, 1, 1520)`,
        [fx.userB],
      );
      await c.query("select public.ranked_roll_season(null)");
      await c.query("select public.ranked_roll_season(null)");
      const seasonAwards = await c.query(
        "select count(*)::int as n from public.awards where user_id = $1 and competition_kind = 'ranked_season'",
        [fx.userB],
      );
      expect(seasonAwards.rows[0]).toEqual({ n: 1 });
    });
  });

  it("(e) abandonado → sin premio aunque tenga posición", async () => {
    await withRollback(async (c) => {
      const fx = await makeMatchFixture(c);
      await c.query("update public.participants set placement = 2, abandoned = true where id = $1", [fx.pA]);
      await c.query("update public.participants set placement = 1 where id = $1", [fx.pB]);
      await finish(c, fx.tournamentId);
      expect(await awardsOf(c, fx.userA)).toEqual([]);
      expect(await awardsOf(c, fx.userB)).toEqual([{ competition_id: fx.tournamentId, award: "gold" }]);
    });
  });

  it("torneo real de punta a punta: a lo sumo 1 premio por humano, coherente con su posición", async () => {
    await withRollback(async (c) => {
      const { tournamentId, users } = await startRealTournament(c, 2);
      expect(await driveTournament(c, tournamentId)).toBeGreaterThanOrEqual(0);
      await c.query("set constraints all immediate");
      for (const uid of users) {
        const p = (
          await c.query<{ placement: number | null; eliminated_phase: string | null }>(
            "select placement, eliminated_phase from public.participants where tournament_id = $1 and user_id = $2",
            [tournamentId, uid],
          )
        ).rows[0]!;
        const expected =
          p.placement === 1 ? "gold"
          : p.placement === 2 ? "silver"
          : (p.placement != null && p.placement <= 4) || p.eliminated_phase === "semis" ? "bronze"
          : null;
        expect(await awardsOf(c, uid)).toEqual(expected ? [{ competition_id: tournamentId, award: expected }] : []);
      }
    });
  });

  it("anon/authenticated no leen ni escriben `awards` directo (solo por la RPC)", async () => {
    await withRollback(async (c) => {
      const fx = await makeMatchFixture(c);
      await asRole(c, "authenticated", fx.userA);
      await c.query("savepoint s");
      await expect(c.query("select * from public.awards")).rejects.toThrow(/permission denied/);
      await c.query("rollback to savepoint s");
      await c.query("savepoint s2");
      await expect(c.query("select public.award_tournament($1)", [fx.tournamentId])).rejects.toThrow(/permission denied/);
      await c.query("rollback to savepoint s2");
      await resetRole(c);
    });
  });
});
