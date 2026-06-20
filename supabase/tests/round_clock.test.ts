// 9.0(b) — Reloj de ronda compartido (4.6). N humanos en grupos distintos: al abrir la jornada 1,
// los penales de la misma ronda de TODOS los matches con humanos se abren juntos en una transacción
// → comparten UN solo `deadline`. Es la garantía de sincronización entre humanos.
import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { asRole, closePool, createUser, resetRole, withRollback } from "./_db";
import { startRealTournament } from "./_fixtures";

afterAll(closePool);

describe("reloj de ronda compartido", () => {
  it("los penales de la ronda 1 de matches con humanos comparten un solo deadline", async () => {
    await withRollback(async (c) => {
      const { tournamentId } = await startRealTournament(c, 3);

      // start_tournament deja un backstop largo; vencemos ese tiempo muerto y pokeamos el backstop
      // para abrir la jornada 1 (tarea 3: el 1er penal arranca con los 10s plenos).
      await c.query(
        `update public.tournaments set round_deadline = now() - interval '1 second' where id = $1`,
        [tournamentId],
      );
      await c.query("select public.tick()");

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

// B2.1 — la ventana de presentación arranca cuando el humano entra a /partido, no antes.
describe("begin_presentation (reloj de presentación relativo a la llegada)", () => {
  const secs = (rd: string | null) =>
    rd === null ? null : (new Date(rd).getTime() - Date.now()) / 1000;

  it("start_tournament fija la ventana de presentación (~6s) como round_deadline (F3)", async () => {
    await withRollback(async (c) => {
      const { tournamentId } = await startRealTournament(c, 2);

      // F3: el backstop ES la ventana de presentación (6s), no 30s. El 1er penal lo abre el cron al
      // vencer; no dependemos de begin_presentation del cliente (que no surtía efecto en prod).
      const before = await c.query<{ rd: string | null }>(
        `select round_deadline::text as rd from public.tournaments where id = $1`,
        [tournamentId],
      );
      const left = secs(before.rows[0]!.rd)!;
      expect(left).toBeGreaterThan(2);
      expect(left).toBeLessThanOrEqual(7);
    });
  });

  it("begin_presentation ya no extiende ni acorta la ventana de 6s (queda no-op, F3)", async () => {
    await withRollback(async (c) => {
      const { tournamentId, users } = await startRealTournament(c, 2);

      // Con la ventana en 6s (< 8s del guard), begin_presentation es no-op: ni la pisa ni la extiende.
      await asRole(c, "authenticated", users[0]);
      await c.query("select public.begin_presentation($1)", [tournamentId]);
      await resetRole(c);

      const after = await c.query<{ rd: string | null }>(
        `select round_deadline::text as rd from public.tournaments where id = $1`,
        [tournamentId],
      );
      const left = secs(after.rows[0]!.rd)!;
      expect(left).toBeGreaterThan(2);
      expect(left).toBeLessThanOrEqual(7);
    });
  });

  it("rechaza a un no-participante", async () => {
    await withRollback(async (c) => {
      const { tournamentId } = await startRealTournament(c, 2);
      const intruder = await createUser(c, `intr_${randomUUID().slice(0, 8)}`);
      await asRole(c, "authenticated", intruder);
      // El `raise` aborta la transacción → savepoint para poder seguir tras el rollback parcial.
      await c.query("savepoint sp_intruder");
      await expect(
        c.query("select public.begin_presentation($1)", [tournamentId]),
      ).rejects.toThrow(/not_participant/);
      await c.query("rollback to savepoint sp_intruder");
      await resetRole(c);
    });
  });
});
