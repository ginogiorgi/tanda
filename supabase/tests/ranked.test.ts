// Fase 4b — Ranked 1v1: cola (ventana por espera), partido completo con Δ aplicado UNA vez,
// abandono = derrota, invitado juega, cierre de temporada, grants y paridad TS↔SQL del motor.
import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { afterAll, describe, expect, it } from "vitest";
import { asRole, closePool, createUser, getPool, resetRole, withRollback } from "./_db";
import { driveTournament } from "./_drive";
import {
  applyResult,
  divisionIndex,
  rankedDifficulty,
  seasonIdFor,
  type RankedState,
} from "../../lib/engine/ranked";

afterAll(closePool);

type Poll = { status: "idle" | "queued" | "matched" | "busy"; tournament_id?: string; window?: number | null };

async function as<T>(c: PoolClient, uid: string, sql: string, params: unknown[] = []): Promise<T> {
  await asRole(c, "authenticated", uid);
  const { rows } = await c.query<{ r: T }>(sql, params);
  await resetRole(c);
  return rows[0]!.r;
}

const enqueue = (c: PoolClient, uid: string) => as<Poll>(c, uid, "select public.ranked_enqueue() as r");
const poll = (c: PoolClient, uid: string) => as<Poll>(c, uid, "select public.ranked_poll() as r");

/** Espera que `sql` falle con `re` sin abortar la transacción del test (savepoint). */
async function expectFails(c: PoolClient, sql: string, re: RegExp): Promise<void> {
  await c.query("savepoint expect_fail");
  await expect(c.query(sql)).rejects.toThrow(re);
  await c.query("rollback to savepoint expect_fail");
}

async function user(c: PoolClient, tag: string): Promise<string> {
  return createUser(c, `${tag}_${randomUUID().slice(0, 8)}`);
}

async function setRating(c: PoolClient, uid: string, rating: number, placementLeft = 0): Promise<void> {
  await c.query("select public.ranked_ensure_player($1)", [uid]);
  await c.query("update public.ranked_players set rating = $2, placement_left = $3 where user_id = $1", [
    uid,
    rating,
    placementLeft,
  ]);
}

async function player(c: PoolClient, uid: string) {
  const { rows } = await c.query<{ rating: number; games: number; wins: number; placement_left: number }>(
    "select rating, games, wins, placement_left from public.ranked_players where user_id = $1",
    [uid],
  );
  return rows[0]!;
}

describe("ranked: cola", () => {
  it("dos parejos se emparejan en un torneo ranked 1v1 y la cola queda vacía", async () => {
    await withRollback(async (c) => {
      const a = await user(c, "rk_a");
      const b = await user(c, "rk_b");
      expect((await enqueue(c, a)).status).toBe("queued"); // solo → espera (no se auto-empareja)
      const pb = await enqueue(c, b);
      expect(pb.status).toBe("matched");
      const pa = await poll(c, a);
      expect(pa.status).toBe("matched");
      expect(pa.tournament_id).toBe(pb.tournament_id);

      const t = (
        await c.query<{ mode_id: string; n: string; m: string }>(
          `select t.mode_id,
                  (select count(*) from public.participants p where p.tournament_id = t.id and not p.is_bot) n,
                  (select count(*) from public.matches m where m.tournament_id = t.id and m.phase = 'final') m
             from public.tournaments t where t.id = $1`,
          [pb.tournament_id],
        )
      ).rows[0]!;
      expect(t).toEqual({ mode_id: "ranked", n: "2", m: "1" });
      const q = await c.query("select 1 from public.ranked_queue");
      expect(q.rowCount).toBe(0);

      // Lo que está en juego quedó guardado (parejos en ubicación: ±32).
      const rm = (
        await c.query<{ home_stakes: { win: number; loss: number } }>(
          "select home_stakes from public.ranked_matches where tournament_id = $1",
          [pb.tournament_id],
        )
      ).rows[0]!;
      expect(rm.home_stakes).toEqual({ win: 32, loss: -32 });
    });
  });

  it("la ventana se abre con la espera: ±100 → ±250 (10s) → cualquiera (20s)", async () => {
    await withRollback(async (c) => {
      const a = await user(c, "rk_w1");
      const b = await user(c, "rk_w2");
      await setRating(c, a, 1500);
      await setRating(c, b, 1700);
      await enqueue(c, a);
      expect((await enqueue(c, b)).status).toBe("queued"); // 200 > 100

      await c.query("update public.ranked_queue set enqueued_at = now() - interval '12 seconds' where user_id = $1", [a]);
      const p = await poll(c, b);
      expect(p.status).toBe("matched"); // A ya abrió a ±250

      const d = await user(c, "rk_w3");
      const e = await user(c, "rk_w4");
      await setRating(c, d, 1200);
      await setRating(c, e, 1900);
      await enqueue(c, d);
      expect((await enqueue(c, e)).status).toBe("queued");
      await c.query("update public.ranked_queue set enqueued_at = now() - interval '12 seconds' where user_id = $1", [d]);
      expect((await poll(c, e)).status).toBe("queued"); // 700 > 250
      await c.query("update public.ranked_queue set enqueued_at = now() - interval '21 seconds' where user_id = $1", [d]);
      expect((await poll(c, e)).status).toBe("matched"); // ≥20s: cualquier humano
    });
  });

  it("el backstop de pg_cron empareja aunque nadie pollee; colas viejas se limpian", async () => {
    await withRollback(async (c) => {
      const a = await user(c, "rk_t1");
      const b = await user(c, "rk_t2");
      const z = await user(c, "rk_t3");
      await c.query("select public.ranked_ensure_player(u) from unnest($1::uuid[]) u", [[a, b, z]]);
      await c.query(
        `insert into public.ranked_queue (user_id, rating, enqueued_at, last_seen)
         values ($1, 1500, now(), now()), ($2, 1500, now(), now()),
                ($3, 1500, now() - interval '1 minute', now() - interval '1 minute')`,
        [a, b, z],
      );
      await c.query("select public.ranked_tick()");
      expect((await poll(c, a)).status).toBe("matched");
      expect((await poll(c, z)).status).toBe("idle"); // estaba colgado → purgado, no emparejado
    });
  });

  it("ranked no entra por quick_play/create_room, y estando en un torneo no se encola", async () => {
    await withRollback(async (c) => {
      const a = await user(c, "rk_q");
      await asRole(c, "authenticated", a);
      await expectFails(c, "select * from public.quick_play('ranked')", /invalid_mode/);
      await resetRole(c);
    });
    await withRollback(async (c) => {
      const a = await user(c, "rk_q2");
      await asRole(c, "authenticated", a);
      await c.query("select * from public.quick_play('worldcup')");
      await resetRole(c);
      expect((await enqueue(c, a)).status).toBe("busy");
    });
  });
});

async function matched(c: PoolClient, a: string, b: string): Promise<string> {
  await enqueue(c, a);
  const r = await enqueue(c, b);
  expect(r.status).toBe("matched");
  return r.tournament_id!;
}

describe("ranked: partido", () => {
  it("partido completo → Δ aplicado una sola vez (idempotente) y suma cero entre parejos", async () => {
    await withRollback(async (c) => {
      const a = await user(c, "rk_f1");
      const b = await user(c, "rk_f2");
      await setRating(c, a, 1500);
      await setRating(c, b, 1500);
      const t = await matched(c, a, b);

      expect(await driveTournament(c, t)).toBeGreaterThan(0);

      const pa = await player(c, a);
      const pb = await player(c, b);
      expect(pa.games).toBe(1);
      expect(pb.games).toBe(1);
      expect(pa.wins + pb.wins).toBe(1);
      expect(pa.rating + pb.rating).toBe(3000);
      expect(Math.abs(pa.rating - 1500)).toBe(16);

      await c.query("select public.ranked_settle($1)", [t]); // otra vez → no-op
      expect((await player(c, a)).rating).toBe(pa.rating);

      const view = await as<{ settled: boolean; won: boolean; me: { result: { delta: number } } }>(
        c,
        a,
        "select public.get_ranked_match($1) as r",
        [t],
      );
      expect(view.settled).toBe(true);
      expect(view.me.result.delta).toBe(pa.rating - 1500);
      expect(view.won).toBe(pa.wins === 1);

      // Fuera del historial de torneos.
      const hist = await as<unknown[]>(c, a, "select public.get_tournament_history() as r");
      expect(hist).toHaveLength(0);
    });
  });

  it("abandonar = derrota inmediata del que abandona", async () => {
    await withRollback(async (c) => {
      const a = await user(c, "rk_ab1");
      const b = await user(c, "rk_ab2");
      const t = await matched(c, a, b);
      // Arrancar el primer penal.
      await c.query("update public.tournaments set round_deadline = now() - interval '1 second' where id = $1", [t]);
      await c.query("select public.tick()");
      const m = (await c.query<{ id: string }>("select id from public.matches where tournament_id = $1", [t])).rows[0]!;

      await asRole(c, "authenticated", a);
      await c.query("select public.abandon($1)", [m.id]);
      await resetRole(c);

      const st = (await c.query<{ status: string }>("select status from public.tournaments where id = $1", [t])).rows[0]!;
      expect(st.status).toBe("finished");
      expect((await player(c, a)).wins).toBe(0);
      expect((await player(c, b)).wins).toBe(1);
      expect((await player(c, a)).rating).toBe(1468); // ubicación: −32
      const open = await c.query(
        "select 1 from public.penalties pe join public.matches m on m.id = pe.match_id where m.tournament_id = $1 and pe.status <> 'resolved'",
        [t],
      );
      expect(open.rowCount).toBe(0);
    });
  });

  it("un invitado (anónimo) juega ranked y aparece en la tabla", async () => {
    await withRollback(async (c) => {
      const g = await user(c, "rk_guest");
      const b = await user(c, "rk_g2");
      await c.query("update auth.users set is_anonymous = true where id = $1", [g]);
      const t = await matched(c, g, b);
      await driveTournament(c, t);
      const ranking = await as<{ rows: { username: string }[]; me: { position: number } | null }>(
        c,
        g,
        "select public.get_ranking() as r",
      );
      expect(ranking.rows).toHaveLength(2);
      expect(ranking.me?.position).toBeGreaterThan(0);
    });
  });

  it("las preguntas mezclan bancos y la dificultad sigue el nivel", async () => {
    await withRollback(async (c) => {
      const a = await user(c, "rk_d1");
      const b = await user(c, "rk_d2");
      await setRating(c, a, 1950);
      await setRating(c, b, 1950);
      const t = await matched(c, a, b);
      await c.query("update public.tournaments set round_deadline = now() - interval '1 second' where id = $1", [t]);
      await c.query("select public.tick()");
      const pe = (
        await c.query<{ difficulty: string }>(
          "select pe.difficulty from public.penalties pe join public.matches m on m.id = pe.match_id where m.tournament_id = $1",
          [t],
        )
      ).rows[0]!;
      expect(pe.difficulty).toBe("hard");
    });
  });
});

describe("ranked: temporadas y perfil", () => {
  it("cambio de temporada: guarda el resultado y reset suave con 3 de ubicación", async () => {
    await withRollback(async (c) => {
      const a = await user(c, "rk_s");
      await c.query(
        "insert into public.ranked_seasons values ('apertura-2020', 'Apertura 2020', '2020-01-01', '2020-07-01')",
      );
      await c.query(
        `insert into public.ranked_players (user_id, rating, placement_left, season_id, season_games, season_wins, season_peak)
         values ($1, 1800, 0, 'apertura-2020', 10, 7, 1820)`,
        [a],
      );
      await c.query("select public.ranked_roll_season(null)");
      const p = (
        await c.query<{ rating: number; placement_left: number; season_id: string }>(
          "select rating, placement_left, season_id from public.ranked_players where user_id = $1",
          [a],
        )
      ).rows[0]!;
      expect(p).toEqual({ rating: 1650, placement_left: 3, season_id: seasonIdFor(new Date()) });
      const res = (
        await c.query<{ peak_rating: number }>(
          "select peak_rating from public.ranked_season_results where user_id = $1 and season_id = 'apertura-2020'",
          [a],
        )
      ).rows[0]!;
      expect(res.peak_rating).toBe(1820);

      const stats = await as<{ divisions: { id: string; season_id: string | null }[] }>(
        c,
        a,
        "select public.get_profile_stats() as r",
      );
      expect(stats.divisions.find((d) => d.id === "libertadores")?.season_id).toBe("apertura-2020");
      expect(stats.divisions.find((d) => d.id === "leyenda")?.season_id).toBeNull();
    });
  });
});

describe("ranked: grants", () => {
  it("anon no ejecuta nada ranked; authenticated no toca las internas", async () => {
    await withRollback(async (c) => {
      await asRole(c, "anon");
      await expectFails(c, "select public.ranked_enqueue()", /permission denied/);
      await resetRole(c);
    });
    await withRollback(async (c) => {
      const a = await user(c, "rk_g");
      await asRole(c, "authenticated", a);
      await expectFails(c, "select public.ranked_settle(gen_random_uuid())", /permission denied/);
      await expectFails(c, "select * from public.ranked_players", /permission denied/);
      await resetRole(c);
    });
  });
});

describe("ranked: paridad TS↔SQL", () => {
  it("ranked_apply_result / division / difficulty = lib/engine/ranked", async () => {
    const cases: { s: RankedState; opp: number; won: boolean }[] = [];
    for (let i = 0; i < 400; i++) {
      const r = (i * 7919) % 2600;
      cases.push({
        s: { rating: r, placementLeft: i % 7, shield: i % 4 },
        opp: (i * 104729) % 2600,
        won: i % 2 === 0,
      });
    }
    const { rows } = await getPool().query<{
      i: number;
      rating: number;
      placement_left: number;
      shield: number;
      delta: number;
      promoted: boolean;
      demoted: boolean;
      shield_saved: boolean;
      div: number;
      diff: string;
    }>(
      `select x.i, r.*, public.ranked_division(x.rating) as div,
              public.ranked_difficulty(x.rating, ((x.i % 14) + 1)::int)::text as diff
         from unnest($1::int[], $2::int[], $3::int[], $4::int[], $5::bool[]) with ordinality
              as x(rating, placement, shield, opp, won, i)
         cross join lateral public.ranked_apply_result(x.rating, x.placement, x.shield, x.opp, x.won) r
        order by x.i`,
      [
        cases.map((c) => c.s.rating),
        cases.map((c) => c.s.placementLeft),
        cases.map((c) => c.s.shield),
        cases.map((c) => c.opp),
        cases.map((c) => c.won),
      ],
    );
    rows.forEach((row, k) => {
      const c = cases[k]!;
      const o = applyResult(c.s, c.opp, c.won);
      expect({
        rating: row.rating,
        placementLeft: row.placement_left,
        shield: row.shield,
        delta: row.delta,
        promoted: row.promoted,
        demoted: row.demoted,
        shieldSaved: row.shield_saved,
      }).toEqual({ ...o.state, delta: o.delta, promoted: o.promoted, demoted: o.demoted, shieldSaved: o.shieldSaved });
      expect(row.div).toBe(divisionIndex(c.s.rating));
      expect(row.diff).toBe(rankedDifficulty(c.s.rating, (Number(row.i) % 14) + 1));
    });
  });
});
