// Feedback 4 #20 — torneo congelado en prod (22/11, 2d39f332): dos penales humanos de partidos
// distintos vencían en el MISMO instante y se resolvieron en dos transacciones concurrentes (un poke por
// cliente). Cada `resolve_round` veía el penal del otro todavía `open` (sin commit) → ninguna fijaba
// `round_deadline` → estado muerto: partidos `in_progress`, sin penal abierto, sin deadline, y ni
// `open_next_round` ni `tick()` lo destrababan.
//
// A diferencia del resto de la suite, la carrera necesita DOS conexiones que vean commits reales → este
// archivo commitea su fixture y la borra al final. Pausa el cron `tanda-tick` local mientras corre para
// que el backstop no resuelva los penales antes que el test.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Pool, PoolClient } from "pg";
import { closePool, getPool } from "./_db";
import { startRealTournament } from "./_fixtures";

afterAll(closePool);

async function setCron(c: PoolClient, active: boolean): Promise<void> {
  await c.query(
    "select cron.alter_job(jobid, active => $1) from cron.job where jobname = 'tanda-tick'",
    [active],
  );
}

/** Torneo real commiteado con 4 humanos → ≥2 partidos humanos abiertos en la jornada 1. */
async function committedTournament(): Promise<{ roomId: string; tournamentId: string; users: string[] }> {
  const c = await getPool().connect();
  try {
    await c.query("begin");
    const t = await startRealTournament(c, 4);
    // start_tournament deja un lead-in (round_deadline futuro) → vencerlo y abrir la jornada 1.
    await c.query(
      "update public.tournaments set round_deadline = now() - interval '1 second' where id = $1",
      [t.tournamentId],
    );
    await c.query("select public.open_next_round($1)", [t.tournamentId]);
    await c.query("commit");
    return t;
  } catch (e) {
    await c.query("rollback").catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}

async function openHumanPenalties(tournamentId: string): Promise<string[]> {
  const { rows } = await getPool().query<{ id: string }>(
    `select pe.id from public.penalties pe join public.matches m on m.id = pe.match_id
      where m.tournament_id = $1 and not m.is_bot_only and pe.status in ('open', 'second_chance')
      order by pe.id`,
    [tournamentId],
  );
  return rows.map((r) => r.id);
}

/**
 * Resuelve como un poke de cron (uid null). Para la carrera: deja todos los penales en su respuesta
 * correcta para ambos lados → resolución directa (sin 2ª chance), que es la rama que cierra la ronda.
 */
async function answerAllCorrect(c: Pool | PoolClient, penaltyId: string): Promise<void> {
  await c.query(
    `insert into public.penalty_answers
       (penalty_id, participant_id, option_index, selected_at, is_correct, is_random, phase)
     select pe.id, p.pid, q.correct_index, now(), true, false, 'first'
       from public.penalties pe join public.questions q on q.id = pe.question_id
       cross join lateral (values (pe.kicker_participant_id), (pe.keeper_participant_id)) p(pid)
      where pe.id = $1
     on conflict (penalty_id, participant_id, phase) do nothing`,
    [penaltyId],
  );
}

async function cleanup(t: { roomId: string; tournamentId: string; users: string[] }): Promise<void> {
  const c = await getPool().connect();
  try {
    await c.query("delete from public.rooms where id = $1", [t.roomId]);
    await c.query("delete from auth.users where id = any($1::uuid[])", [t.users]);
  } finally {
    c.release();
  }
}

describe("cierre de ronda con penales simultáneos (#20)", () => {
  beforeAll(async () => {
    const c = await getPool().connect();
    try {
      await setCron(c, false);
    } finally {
      c.release();
    }
  });
  afterAll(async () => {
    const c = await getPool().connect();
    try {
      await setCron(c, true);
    } finally {
      c.release();
    }
  });

  it(
    "dos resolve_penalty concurrentes dejan round_deadline fijado",
    async () => {
      const t = await committedTournament();
      try {
        const pens = await openHumanPenalties(t.tournamentId);
        expect(pens.length).toBeGreaterThanOrEqual(2);

        const pool = getPool();
        await pool.query(
          `update public.penalties set deadline = now() - interval '1 second' where id = any($1::uuid[])`,
          [pens],
        );
        for (const p of pens) await answerAllCorrect(pool, p);

        // Todos menos los dos últimos, en serie y commiteados.
        const [a, b] = pens.slice(-2) as [string, string];
        for (const p of pens.slice(0, -2)) await pool.query("select public.resolve_penalty($1)", [p]);

        const ca = await pool.connect();
        const cb = await pool.connect();
        try {
          await ca.query("begin");
          await cb.query("begin");
          // A resuelve y NO commitea todavía.
          await ca.query("select public.resolve_penalty($1)", [a]);
          // B resuelve en paralelo. Sin el fix no bloquea y ve el penal de A todavía `open`.
          const bDone = cb.query("select public.resolve_penalty($1)", [b]);
          // Dar tiempo a que B llegue lo más lejos posible antes del commit de A.
          await new Promise((r) => setTimeout(r, 300));
          await ca.query("commit");
          await bDone;
          await cb.query("commit");
        } finally {
          ca.release();
          cb.release();
        }

        const { rows } = await pool.query<{ rd: Date | null; open: string }>(
          `select t.round_deadline rd,
                  (select count(*) from public.penalties pe join public.matches m on m.id = pe.match_id
                    where m.tournament_id = t.id and pe.status in ('open','second_chance')) open
             from public.tournaments t where t.id = $1`,
          [t.tournamentId],
        );
        expect(Number(rows[0]!.open)).toBe(0);
        expect(rows[0]!.rd).not.toBeNull();
      } finally {
        await cleanup(t);
      }
    },
    60_000,
  );

  it(
    "tick() destraba un torneo en estado muerto y lo registra en ops_events",
    async () => {
      const t = await committedTournament();
      try {
        const pool = getPool();
        const pens = await openHumanPenalties(t.tournamentId);
        await pool.query(
          `update public.penalties set deadline = now() - interval '1 second' where id = any($1::uuid[])`,
          [pens],
        );
        for (const p of pens) await pool.query("select public.resolve_penalty($1)", [p]);
        // Forzar el estado muerto observado en prod (si hubo 2ª chance, resolverla también).
        for (const p of await openHumanPenalties(t.tournamentId)) {
          await pool.query("update public.penalties set deadline = now() - interval '1 second' where id = $1", [p]);
          await pool.query("select public.resolve_penalty($1)", [p]);
        }
        await pool.query(
          `update public.tournaments set round_deadline = null where id = $1`,
          [t.tournamentId],
        );
        // Envejecer el último penal más allá de la gracia del watchdog.
        await pool.query(
          `update public.penalties pe set deadline = now() - interval '1 minute'
             from public.matches m where m.id = pe.match_id and m.tournament_id = $1`,
          [t.tournamentId],
        );

        await pool.query("select public.tick()");

        const open = await openHumanPenalties(t.tournamentId);
        const { rows } = await pool.query<{ n: string }>(
          `select count(*) n from public.ops_events where kind = 'round_stall_healed' and tournament_id = $1`,
          [t.tournamentId],
        );
        expect(Number(rows[0]!.n)).toBe(1);
        // La ronda siguiente quedó abierta (o el torneo avanzó de jornada) → hay juego de nuevo.
        expect(open.length).toBeGreaterThan(0);
      } finally {
        await cleanup(t);
      }
    },
    60_000,
  );
});
