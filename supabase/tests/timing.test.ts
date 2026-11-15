// Tiempos de juego (feedback 2, P3): el server lee `public.game_timing()` y eso tiene que ser
// exactamente `TIMING` del motor; la espera de sala sale de `game_modes.lobby_seconds` (= FORMATS).
import { afterAll, describe, expect, it } from "vitest";
import { FORMATS, type ModeId } from "@/lib/engine/formats";
import { TIMING } from "@/lib/engine/timing";
import { asRole, closePool, createUser, resetRole, withRollback } from "./_db";
import { startRealTournament } from "./_fixtures";

afterAll(closePool);

describe("tiempos de juego: fuente única TS ↔ SQL", () => {
  it("game_timing() === TIMING (mismas keys, mismos valores)", async () => {
    await withRollback(async (c) => {
      const { rows } = await c.query<{ t: Record<string, number> }>("select public.game_timing() as t");
      expect(rows[0]!.t).toEqual(TIMING);
    });
  });

  it("game_modes.lobby_seconds === FORMATS[mode].lobbyS", async () => {
    await withRollback(async (c) => {
      const { rows } = await c.query<{ id: string; lobby_seconds: number }>(
        "select id, lobby_seconds from public.game_modes where id <> 'ranked'",
      );
      expect(rows.length).toBeGreaterThan(0);
      for (const r of rows) expect(r.lobby_seconds).toBe(FORMATS[r.id as ModeId].lobbyS);
    });
  });

  it("create_room abre la sala con la espera del modo (30 s)", async () => {
    await withRollback(async (c) => {
      const uid = await createUser(c, "timing_host");
      await asRole(c, "authenticated", uid);
      const { rows } = await c.query<{ room_id: string }>("select room_id from public.create_room('worldcup')");
      await resetRole(c);
      const r = await c.query<{ s: number }>(
        "select extract(epoch from starts_at - now())::float8 as s from public.rooms where id = $1",
        [rows[0]!.room_id],
      );
      expect(r.rows[0]!.s).toBe(FORMATS.worldcup.lobbyS);
    });
  });

  it("torneo real: presentación de respaldo y penal abierto salen de TIMING", async () => {
    await withRollback(async (c) => {
      // En una transacción now() es fijo → las diferencias son exactas.
      const { tournamentId } = await startRealTournament(c, 1);
      const t = await c.query<{ s: number }>(
        "select extract(epoch from round_deadline - now())::float8 as s from public.tournaments where id = $1",
        [tournamentId],
      );
      expect(t.rows[0]!.s).toBe(TIMING.presentationBackstopS);

      await c.query("update public.tournaments set round_deadline = now() - interval '1 second' where id = $1", [tournamentId]);
      await c.query("select public.tick()");
      const p = await c.query<{ s: number }>(
        `select distinct extract(epoch from pe.deadline - pe.started_at)::float8 as s
           from public.penalties pe join public.matches m on m.id = pe.match_id
          where m.tournament_id = $1 and pe.status = 'open'`,
        [tournamentId],
      );
      expect(p.rows).toEqual([{ s: TIMING.penaltyS }]);
    });
  });

  it("los clientes no ejecutan game_timing() directo (solo las RPC)", async () => {
    await withRollback(async (c) => {
      const { rows } = await c.query<{ anon: boolean; auth: boolean }>(
        `select has_function_privilege('anon', 'public.game_timing()', 'execute') as anon,
                has_function_privilege('authenticated', 'public.game_timing()', 'execute') as auth`,
      );
      expect(rows[0]).toEqual({ anon: false, auth: false });
    });
  });
});
