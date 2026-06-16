/**
 * Helpers puros del realtime de penal (sin red, testeables). El componente cliente arma el
 * canal privado `match:{id}` y le pasa a estas funciones el payload crudo del Broadcast
 * `penal:start`; acá vive el shape del payload y el cálculo del reloj contra el server.
 *
 * Patrón espejo de `lib/lobby/presence.ts`.
 */

/** Dificultad de la pregunta (enum `difficulty` de la DB, SPEC §2.1). */
export type Difficulty = "easy" | "medium" | "hard" | "very_hard";

/**
 * Payload del Broadcast `penal:start` que emite `open_penalty` (ver migración
 * `penal_broadcast`). **Nunca** incluye `correct_index` (anti-trampa, SPEC §7): la pregunta
 * viaja sin la respuesta correcta hasta que el penal está `resolved`.
 */
export type PenalStartPayload = {
  penalty_id: string;
  match_id: string;
  idx: number;
  prompt: string;
  options: string[];
  difficulty: Difficulty;
  /** ISO timestamp (server) en que se abrió el penal. */
  started_at: string;
  /** ISO timestamp (server) límite de respuesta = `started_at + 10s`. */
  deadline: string;
  /** `now()` del server al emitir → para estimar el offset del reloj del cliente. */
  server_now: string;
};

/**
 * Offset cliente↔servidor en ms (SPEC §1.3): cuánto hay que sumarle al reloj local para
 * estimar el reloj del server. La barra de tiempo se dibuja contra el `deadline` server
 * corregido por este offset, no contra el reloj local (que puede tener skew o trampa).
 * Mismo criterio que el countdown del Lobby.
 */
export function clockOffset(serverNow: string, now = Date.now()): number {
  return new Date(serverNow).getTime() - now;
}

/**
 * Milisegundos restantes hasta el `deadline` (server) visto desde el reloj local corregido
 * por `offset`. Clampa a 0 (nunca negativo): la resolución la decide el server, el cliente
 * solo dibuja.
 */
export function remainingMs(
  deadline: string,
  offset: number,
  now = Date.now(),
): number {
  return Math.max(0, new Date(deadline).getTime() - (now + offset));
}
