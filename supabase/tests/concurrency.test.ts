// 9.6 / §12.5 — varias salas/torneos en simultáneo sin interferencia. Arrancamos DOS torneos a la
// vez y verificamos aislamiento: drivear uno (vencer SOLO sus deadlines + tick) no avanza al otro, y
// el segundo termina después con todas sus invariantes intactas. tick() es global pero solo resuelve
// penales vencidos → al expirar solo los de un torneo, el otro queda quieto. Cierra el último punto de
// §12 que no estaba cubierto por la suite (el e2e de torneo corría uno solo).
import { afterAll, describe, expect, it } from "vitest";
import { closePool, withRollback, asRole, resetRole } from "./_db";
import { startRealTournament } from "./_fixtures";
import { driveTournament } from "./_drive";

afterAll(closePool);

async function status(c: Parameters<typeof driveTournament>[0], id: string): Promise<string> {
  const { rows } = await c.query<{ status: string }>(
    "select status from public.tournaments where id = $1",
    [id],
  );
  return rows[0]!.status;
}

async function summary(c: Parameters<typeof driveTournament>[0], id: string) {
  const { rows } = await c.query<{
    status: string;
    champion: string | null;
    third: string | null;
    participants: string;
    placed: string;
  }>(
    `select t.status, t.champion_participant_id champion, t.third_place_participant_id third,
       (select count(*) from public.participants where tournament_id = t.id) participants,
       (select count(*) from public.participants
          where tournament_id = t.id and (placement is not null or eliminated_phase is not null)) placed
     from public.tournaments t where t.id = $1`,
    [id],
  );
  return rows[0]!;
}

describe("torneos simultáneos sin interferencia (§12.5)", () => {
  it(
    "drivear un torneo no afecta al otro; ambos terminan con sus invariantes",
    async () => {
      await withRollback(async (c) => {
        const a = await startRealTournament(c, 1);
        const b = await startRealTournament(c, 1);

        // Ambos arrancan in_progress a la vez, con penales de ronda 1 abiertos en paralelo.
        expect(await status(c, a.tournamentId)).toBe("in_progress");
        expect(await status(c, b.tournamentId)).toBe("in_progress");

        // Drive SOLO A: vence sus deadlines y corre tick() hasta el campeón.
        expect(await driveTournament(c, a.tournamentId)).toBeGreaterThanOrEqual(0);

        // Aislamiento: A terminó, B sigue intacto (sus penales no estaban vencidos → tick no los tocó).
        expect(await status(c, a.tournamentId)).toBe("finished");
        expect(await status(c, b.tournamentId)).toBe("in_progress");

        // Ahora B termina por su cuenta, sin haber sido afectado por A.
        expect(await driveTournament(c, b.tournamentId)).toBeGreaterThanOrEqual(0);

        for (const id of [a.tournamentId, b.tournamentId]) {
          const s = await summary(c, id);
          expect(s.status).toBe("finished");
          expect(s.champion).not.toBeNull();
          expect(s.third).not.toBeNull();
          expect(Number(s.participants)).toBe(48);
          expect(Number(s.placed)).toBe(48);
        }

        // Sin solapamiento de participantes entre torneos.
        const overlap = (
          await c.query<{ n: string }>(
            `select count(*) n from public.participants pa
               join public.participants pb on pb.user_id = pa.user_id
              where pa.tournament_id = $1 and pb.tournament_id = $2
                and pa.user_id is not null`,
            [a.tournamentId, b.tournamentId],
          )
        ).rows[0]!;
        expect(Number(overlap.n)).toBe(0);

        // Pertenencia aislada: el humano de A es miembro de A, no de B.
        await asRole(c, "authenticated", a.users[0]!);
        const mine = await c.query<{ in_a: boolean; in_b: boolean }>(
          `select public.is_tournament_member($1) in_a, public.is_tournament_member($2) in_b`,
          [a.tournamentId, b.tournamentId],
        );
        await resetRole(c);
        expect(mine.rows[0]!.in_a).toBe(true);
        expect(mine.rows[0]!.in_b).toBe(false);
      });
    },
    120_000,
  );
});
