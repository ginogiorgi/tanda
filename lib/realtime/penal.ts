/**
 * Helpers puros del realtime de penal (sin red, testeables). El componente cliente arma el
 * canal privado `match:{id}` y le pasa a estas funciones el payload crudo del Broadcast
 * `penal:start`; acá vive el shape del payload y el cálculo del reloj contra el server.
 *
 * Patrón espejo de `lib/lobby/presence.ts`.
 */

/** Dificultad de la pregunta (enum `difficulty` de la DB, SPEC §2.1). */
export type Difficulty = "easy" | "medium" | "hard" | "very_hard";

/** Familia de animación del resultado (mismo enum que el motor, `lib/engine/penalty.ts`). */
export type PenaltyReason = "goal" | "save" | "miss_wide";

/**
 * Payload de `penal:start` (emite `open_penalty`) y de `penal:second_chance` (emite
 * `resolve_penalty` al entrar en segunda chance). **Nunca** incluye `correct_index`
 * (anti-trampa, SPEC §7): la pregunta viaja sin la correcta hasta que el penal está `resolved`.
 */
export type PenalStartPayload = {
  penalty_id: string;
  match_id: string;
  idx: number;
  prompt: string;
  options: string[];
  difficulty?: Difficulty;
  /** ISO timestamp (server) en que se abrió la fase. */
  started_at: string;
  /** ISO timestamp (server) límite de respuesta (= +10s en `first`, +5s en `second_chance`). */
  deadline: string;
  /** `now()` del server al emitir → para estimar el offset del reloj del cliente. */
  server_now: string;
  /** Solo en `penal:second_chance`: opción incorrecta quitada (quedan 2). */
  removed_option?: number;
  phase?: "first" | "second_chance";
  /** Solo al rehidratar (`get_active_match`): mi última selección, para restaurar el resaltado. */
  my_option?: number | null;
};

/**
 * Resultado de `get_active_match` (rehidratación tras refresh, SPEC §5.2). `null` si el caller
 * no tiene partido activo. `penal` es `null` entre penales (match en curso sin penal abierto).
 */
export type ActiveMatch = {
  tournament_id: string;
  match_id: string;
  phase: string;
  home_score: number;
  away_score: number;
  penal: PenalStartPayload | null;
};

/**
 * Payload de `penal:result` (emite `resolve_penalty` al cerrar el penal). Acá SÍ viaja
 * `correct_index` + `explanation`: el penal ya está `resolved`, se revela la correcta (§8.11).
 */
export type PenalResultPayload = {
  penalty_id: string;
  match_id: string;
  idx: number;
  outcome: "resolved";
  winner: "kicker" | "keeper";
  scored: boolean;
  reason: PenaltyReason;
  variant: number;
  phase: "first" | "second_chance";
  correct_index: number;
  explanation: string | null;
  home_score: number;
  away_score: number;
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
