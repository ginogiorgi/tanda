// Driver de torneo para los e2e: "fast-forward" sin dormir. Como `now()` es constante dentro de la
// transacción del test, en cada vuelta vencemos a mano los deadlines de los penales abiertos y el
// tiempo muerto entre rondas, y llamamos `tick()` (el mismo backstop autoritativo de pg_cron) para
// resolver la ronda y abrir la siguiente. El humano del test nunca responde → resolución por bot /
// ausente, igual el torneo corre hasta el campeón.
import type { PoolClient } from "pg";

/**
 * Avanza el torneo hasta `finished`. Devuelve la cantidad de rondas que tardó, o -1 si no terminó
 * dentro de `maxRounds` (→ el test falla, señal de que algo quedó trabado).
 */
export async function driveTournament(
  c: PoolClient,
  tournamentId: string,
  maxRounds = 400,
): Promise<number> {
  for (let i = 0; i < maxRounds; i++) {
    const { rows } = await c.query<{ status: string }>(
      "select status from public.tournaments where id = $1",
      [tournamentId],
    );
    if (rows[0]?.status === "finished") return i;

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
  return -1;
}
