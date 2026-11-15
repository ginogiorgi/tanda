/**
 * Tiempos de juego — fuente única (feedback 2, P3). El server es la autoridad: `public.game_timing()`
 * devuelve exactamente este objeto (paridad en `supabase/tests/timing.test.ts`) y TODAS las RPC lo
 * leen en vez de tener `interval '…'` sueltos (`pnpm db:check-migrations` lo exige). El cliente solo
 * lo usa para textos y para que sus pausas visuales calcen dentro de los huecos del server.
 *
 * La espera de sala va por modo (`game_modes.lobby_seconds` ↔ `FORMATS[mode].lobbyS`).
 */
export const TIMING = {
  /** Penal abierto: ventana para responder. */
  penaltyS: 10,
  /** Segunda oportunidad (empate en la respuesta). */
  secondChanceS: 5,
  /** Entre penales del mismo partido (animación del resultado). */
  betweenPenalsS: 3,
  /** Entre partidos (último penal + ver la tabla del grupo). */
  betweenMatchesS: 7,
  /** Presentación del torneo cuando llega el humano (`begin_presentation`). */
  presentationS: 7,
  /** Respaldo de la presentación si ningún humano la abre (`start_tournament`). */
  presentationBackstopS: 10,
  /** Ver los grupos ya cerrados antes de armar el bracket. */
  groupsCloseS: 4,
  /** Ver los cruces recién armados antes del primer partido de eliminación. */
  bracketLeadInS: 4,
  /** Lead-in entre fases de eliminación directa. */
  koGapS: 2,
  /** Ranked: cara a cara + lo que está en juego. */
  rankedVersusS: 8,
  /** Cola ranked: un jugador cuenta como presente si hizo poll hace menos de esto. */
  queuePresenceS: 8,
  /** Cola ranked: se purga a quien no hizo poll en este tiempo. */
  queuePurgeS: 15,
} as const;

/**
 * Cuánto se queda la pantalla del penal tras terminar el partido antes de ceder a la tabla del grupo.
 * Tiene que entrar en el hueco entre partidos dejando ≥3 s de tabla (con ~1 s de lag de poll).
 */
export const MATCH_RESULT_LINGER_MS = 2000;

/** Ranked: lo que se deja ver el último GOL/ATAJADO antes del resultado. */
export const RANKED_RESULT_LINGER_MS = 2500;
