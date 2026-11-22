/**
 * Helpers puros del realtime de penal (sin red, testeables). El componente cliente arma el
 * canal privado `match:{id}` y le pasa a estas funciones el payload crudo del Broadcast
 * `penal:start`; acá vive el shape del payload y el cálculo del reloj contra el server.
 *
 * Patrón espejo de `lib/lobby/presence.ts`.
 */

import type { ParticipantBrief } from "@/lib/realtime/score";

/** Dificultad de la pregunta (enum `difficulty` de la DB, SPEC §2.1). */
export type Difficulty = "easy" | "medium" | "hard" | "very_hard";

/** Familia de animación del resultado (mismo enum que el motor, `lib/engine/penalty.ts`). */
export type PenaltyReason = "goal" | "save" | "miss_wide";

/**
 * Payload de `penal:start` (emite `open_penalty_internal`) y de `penal:second_chance` (emite
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
  /**
   * Solo en `penal:second_chance`: opción incorrecta quitada (quedan 2). **Por jugador** (tarea 10):
   * a cada uno se le quita la opción que ÉL eligió. El broadcast trae las dos (`_kicker`/`_keeper`) y
   * el cliente normaliza a `removed_option` la del rol propio; `get_active_match` ya devuelve la propia.
   */
  removed_option?: number;
  removed_option_kicker?: number;
  removed_option_keeper?: number;
  phase?: "first" | "second_chance";
  /**
   * Solo en `penal:second_chance`: motivo por el que reaparecen las opciones (10.13). Hoy siempre
   * `"both_missed"` (erraron los dos) → el cliente muestra "Erraron los dos: segunda chance".
   */
  reason?: "both_missed";
  /** Solo al rehidratar (`get_active_match`): mi última selección, para restaurar el resaltado. */
  my_option?: number | null;
  /**
   * Participantes que patean/atajan ESTE penal (autoritativo, de la fila `penalties`). Vienen en
   * `penal:start` y al rehidratar; en `penal:second_chance` NO cambian (mismo `penalty_id`) → el
   * cliente arrastra los del penal en curso. Sirven para colocar los avatares en la escena 3D
   * (§8.2) mapeándolos contra `home`/`away` de {@link MatchScene}.
   */
  kicker_participant_id?: string;
  keeper_participant_id?: string;
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
 * `correct_index`: el penal ya está `resolved`, se revela la correcta (§8.11).
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
  home_score: number;
  away_score: number;
  /**
   * 10.7: el penal se decidió porque uno respondió MÁS RÁPIDO (ambos acertaron). El cliente lo usa
   * para explicar el resultado ("X respondió más rápido") con el delta de los `*_selected_at`.
   */
  won_by_speed: boolean;
  kicker_participant_id: string;
  keeper_participant_id: string;
  /** ISO timestamps (server) de la selección de cada lado en ESTE penal (para mostrar el delta). */
  kicker_selected_at: string | null;
  keeper_selected_at: string | null;
};

/**
 * Payload de `round:next` (emite `notify_round_next` al setear el `round_deadline`): cuándo se abre
 * la próxima ronda. El cliente lo usa para pokear `open_next_round` EXACTO al vencer el deadline en
 * vez de esperar el poll de 1500ms (menos polling, más broadcast). No trae nada del juego.
 */
export type RoundNextPayload = {
  /** ISO timestamp (server) en que vence el tiempo muerto y se abre el próximo penal. */
  open_at: string;
  /** `now()` del server al emitir → para estimar el offset del reloj del cliente. */
  server_now: string;
};

/**
 * Datos estáticos del partido para la escena 3D (RPC `get_match_scene`, SPEC §8.2). No cambia
 * penal a penal: el cliente lo pide una vez al montar la pantalla. `home_avatar`/`away_avatar` son
 * `null` para bots o usuarios sin avatar → `parseAvatar` cae a `DEFAULT_AVATAR`. La camiseta de cada
 * avatar se tiñe con el `kit_primary` del brief de su nación (§8.3 #1).
 */
export type MatchScene = {
  match_id: string;
  /** Participante del caller (home o away), o `null` si no juega (no debería pasar). */
  my_participant_id: string | null;
  home: ParticipantBrief | null;
  away: ParticipantBrief | null;
  /** Crudo de `profiles.avatar` (v2): se lee con `parseAvatar`. */
  home_avatar: unknown;
  away_avatar: unknown;
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

type PhaseRef = Pick<PenalStartPayload, "penalty_id" | "idx" | "started_at">;

/**
 * ¿La fase `incoming` es posterior a la que muestra el cliente? (feedback 4 F). Las fases llegan por tres
 * caminos que se pueden pisar (broadcast, rehidratación al reconectar y el poll del padre): un poll que
 * salió ANTES de un broadcast puede volver DESPUÉS con la fase vieja. Solo se adopta lo más nuevo:
 * otro penal con `idx` mayor, o el mismo penal con una fase que arrancó después (la 2ª chance).
 */
export function isNewerPhase(current: PhaseRef | null, incoming: PhaseRef): boolean {
  if (!current) return true;
  if (incoming.penalty_id !== current.penalty_id) return incoming.idx > current.idx;
  return new Date(incoming.started_at).getTime() > new Date(current.started_at).getTime();
}

/** Backoff de resuscripción del canal: 1 s, 2 s, 4 s, 8 s y tope 15 s. */
export function resubscribeDelayMs(attempt: number): number {
  return Math.min(15_000, 1000 * 2 ** Math.max(0, attempt));
}

/** Misma fase (mismo penal y mismo arranque): el padre no re-renderiza `PenalLive` con cada poll. */
export function samePhase(a: PhaseRef | null, b: PhaseRef | null): boolean {
  if (!a || !b) return a === b;
  return a.penalty_id === b.penalty_id && a.started_at === b.started_at;
}
