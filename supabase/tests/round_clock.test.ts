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

  it("start_tournament deja un backstop largo (~15s) como red de seguridad", async () => {
    await withRollback(async (c) => {
      const { tournamentId } = await startRealTournament(c, 2);

      // Enfoque determinístico: start_tournament solo deja un backstop largo (15s). La ventana real
      // la fija begin_presentation al LLEGAR el humano; el cron abre el 1er penal al vencer.
      const before = await c.query<{ rd: string | null }>(
        `select round_deadline::text as rd from public.tournaments where id = $1`,
        [tournamentId],
      );
      const left = secs(before.rows[0]!.rd)!;
      expect(left).toBeGreaterThan(10);
      expect(left).toBeLessThanOrEqual(16);
    });
  });

  it("begin_presentation re-ancla la ventana a ~6s desde la llegada del humano (idempotente)", async () => {
    await withRollback(async (c) => {
      const { tournamentId, users } = await startRealTournament(c, 2);

      // Llega el humano a /partido → comprime el backstop (15s) a ~6s (2s país + ~4s grupos).
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

      // Idempotente: una segunda llamada (otro humano / re-mount) ya no la pisa (round_deadline < 8s
      // del guard).
      await asRole(c, "authenticated", users[1]);
      await c.query("select public.begin_presentation($1)", [tournamentId]);
      await resetRole(c);

      const after2 = await c.query<{ rd: string | null }>(
        `select round_deadline::text as rd from public.tournaments where id = $1`,
        [tournamentId],
      );
      const left2 = secs(after2.rows[0]!.rd)!;
      expect(left2).toBeGreaterThan(2);
      expect(left2).toBeLessThanOrEqual(7);
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

// T11 — al cerrar la fase de grupos, el torneo NO salta directo al bracket: queda una ventana de ~4s
// con current_phase='groups' (el cliente muestra las tablas finales) y recién después se arma el KO.
describe("pausa de grupos finales antes del KO (T11)", () => {
  const secs = (rd: string | null) =>
    rd === null ? null : (new Date(rd).getTime() - Date.now()) / 1000;

  it("mantiene 'groups' ~4s tras cerrar los grupos, y luego arma el round_of_32 con lead-in de 4s", async () => {
    await withRollback(async (c) => {
      const { tournamentId } = await startRealTournament(c, 2);

      // Driver de SOLO la fase de grupos: vencer deadlines + tick hasta que se ARME la pausa
      // (groups_closed_at seteado mientras current_phase sigue 'groups'). Frenamos ANTES de vencer
      // ese deadline para observar la ventana.
      let armed = false;
      for (let i = 0; i < 400; i++) {
        const { rows } = await c.query<{ phase: string; gca: string | null }>(
          `select current_phase as phase, groups_closed_at::text as gca
             from public.tournaments where id = $1`,
          [tournamentId],
        );
        const st = rows[0]!;
        expect(st.phase).toBe("groups"); // nunca debería saltar a KO antes de la pausa
        if (st.gca !== null) {
          armed = true;
          break;
        }
        await c.query(
          `update public.penalties pe set deadline = now() - interval '1 second'
             from public.matches m
            where m.id = pe.match_id and m.tournament_id = $1
              and pe.status in ('open', 'second_chance')`,
          [tournamentId],
        );
        await c.query(
          `update public.tournaments set round_deadline = now() - interval '1 second'
            where id = $1 and round_deadline is not null`,
          [tournamentId],
        );
        await c.query("select public.tick()");
      }
      expect(armed).toBe(true);

      // Ventana armada: sigue en grupos, deadline ~4s en el futuro y AÚN sin bracket.
      const paused = (
        await c.query<{ phase: string; rd: string | null; ko: string }>(
          `select t.current_phase as phase, t.round_deadline::text as rd,
                  (select count(*) from public.matches
                     where tournament_id = $1 and phase = 'round_of_32') as ko
             from public.tournaments t where t.id = $1`,
          [tournamentId],
        )
      ).rows[0]!;
      expect(paused.phase).toBe("groups");
      expect(Number(paused.ko)).toBe(0);
      const leftPause = secs(paused.rd)!;
      expect(leftPause).toBeGreaterThan(2);
      expect(leftPause).toBeLessThanOrEqual(5);

      // Vencida la ventana + tick → se arma el bracket (16 cruces) con lead-in de ~4s (T7: para ver los cruces).
      await c.query(
        `update public.tournaments set round_deadline = now() - interval '1 second' where id = $1`,
        [tournamentId],
      );
      await c.query("select public.tick()");

      const built = (
        await c.query<{ phase: string; rd: string | null; ko: string }>(
          `select t.current_phase as phase, t.round_deadline::text as rd,
                  (select count(*) from public.matches
                     where tournament_id = $1 and phase = 'round_of_32') as ko
             from public.tournaments t where t.id = $1`,
          [tournamentId],
        )
      ).rows[0]!;
      expect(built.phase).toBe("round_of_32");
      expect(Number(built.ko)).toBe(16);
      const leftLeadIn = secs(built.rd)!;
      expect(leftLeadIn).toBeGreaterThan(2);
      expect(leftLeadIn).toBeLessThanOrEqual(5);
    });
  });
});
