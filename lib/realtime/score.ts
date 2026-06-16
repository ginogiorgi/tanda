/**
 * Helpers puros del realtime de marcadores del torneo (6.5, `score:live`). El componente de
 * bracket (F8 8.5) se suscribe al canal privado `tournament:{id}` y le pasa a estas funciones el
 * payload crudo del Broadcast; acá vive el shape del payload y la reducción a un mapa por partido
 * (último estado gana). Sin red → testeable.
 *
 * Patrón espejo de `lib/realtime/penal.ts` y `lib/lobby/presence.ts`.
 */

/** Fase de un partido (enum `match_phase` de la DB). El 3er puesto se juega en la fase `final`. */
export type MatchPhase =
  | "group"
  | "round_of_32"
  | "round_of_16"
  | "quarters"
  | "semis"
  | "third_place"
  | "final";

/** Resumen de un participante con su nación (lo arma `participant_brief` en la DB). */
export type ParticipantBrief = {
  participant_id: string;
  user_id: string | null;
  is_bot: boolean;
  nation_id: string | null;
  nation_code: string | null;
  nation_name: string | null;
  flag: string | null;
  kit_primary: string | null;
  accent: string | null;
};

/**
 * Payload de `score:live` (lo emite `emit_score_live` al aparecer un cruce, cambiar el marcador
 * penal a penal o terminar un partido, incl. bot-only). Nada sensible: solo marcador + naciones,
 * suficiente para pintar el bracket/grupos sin fetch extra.
 */
export type ScoreLivePayload = {
  match_id: string;
  phase: MatchPhase;
  group_letter: string | null;
  bracket_slot: number | null;
  status: "pending" | "in_progress" | "sudden_death" | "finished";
  home_score: number;
  away_score: number;
  winner_participant_id: string | null;
  home: ParticipantBrief | null;
  away: ParticipantBrief | null;
  /** `now()` del server al emitir (para ordenar/diagnóstico). */
  server_now: string;
};

/** Estado del bracket en el cliente: último `score:live` recibido por partido. */
export type ScoreboardState = Record<string, ScoreLivePayload>;

/**
 * Aplica un `score:live` al estado, quedándose con el más reciente por `match_id`. Idempotente y
 * tolerante al reordenamiento de Broadcasts: si llega uno más viejo que el ya guardado (por
 * `server_now`), lo ignora. Devuelve un objeto nuevo (no muta el anterior).
 */
export function applyScoreUpdate(
  state: ScoreboardState,
  payload: ScoreLivePayload,
): ScoreboardState {
  const prev = state[payload.match_id];
  if (prev && new Date(prev.server_now).getTime() > new Date(payload.server_now).getTime()) {
    return state; // llegó desordenado: el guardado es más nuevo
  }
  return { ...state, [payload.match_id]: payload };
}

/** Partidos del estado que pertenecen a una fase (para render por sección del bracket/grupos). */
export function matchesInPhase(state: ScoreboardState, phase: MatchPhase): ScoreLivePayload[] {
  return Object.values(state).filter((m) => m.phase === phase);
}
