/**
 * Mensajes de error de juego/matchmaking en un solo lugar (9.4). Antes el mismo mapa de códigos de
 * `join_room`/`quick_play` vivía duplicado en PlayMenu, en el home (avisos por query param) y en la
 * page de sala → riesgo de que se desincronizaran. Las RPC devuelven códigos en inglés
 * (`room_not_found`, …); la UI los traduce al rioplatense acá.
 */

/** Códigos que devuelven `join_room` / `quick_play` / la page de sala. */
export const ROOM_ERROR_MESSAGES: Record<string, string> = {
  room_not_found: "No existe una sala con ese código.",
  room_cancelled: "Esa sala se canceló.",
  room_closed: "Esa sala ya cerró: pasaron los 2 minutos.",
  already_started: "Esa partida ya arrancó.",
  room_full: "Esa sala está llena.",
  no_match: "No tenés un partido en curso.",
};

/** Fallback genérico cuando el código no está mapeado (red caída, error inesperado del server). */
export const GENERIC_RETRY_MESSAGE = "No se pudo. Probá de nuevo en un momento.";

/** Traduce un código de error de sala a su mensaje; cae al genérico si no se reconoce. */
export function roomErrorMessage(code: string | null | undefined): string {
  return (code && ROOM_ERROR_MESSAGES[code]) || GENERIC_RETRY_MESSAGE;
}

/** ¿Es un código de error de sala conocido? (para elegir el motivo del aviso al redirigir). */
export function isKnownRoomError(code: string): boolean {
  return code in ROOM_ERROR_MESSAGES;
}
