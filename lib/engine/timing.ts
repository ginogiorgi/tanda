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
  /**
   * Revelado (feedback 3 #2): la jugada se ve SIN cartel hasta que la pelota queda quieta en la red / en
   * las manos / afuera (`BALL_T2` de `lib/penal/shot.ts`); recién ahí aparece el cartel.
   */
  revealS: 1.6,
  /** Cuánto se queda el cartel de GOL/ATAJADO + la correcta antes del próximo penal. */
  resultCardS: 2.5,
  /** Entre penales del mismo partido = jugada + cartel (`revealS + resultCardS`). */
  betweenPenalsS: 4.1,
  /** Entre partidos = jugada + cartel del último penal + ≥3 s de tabla + 1 s de poll. */
  betweenMatchesS: 8.1,
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

/** Desde que llega el resultado hasta que aparece el cartel (ms). */
export const REVEAL_MS = Math.round(TIMING.revealS * 1000);

/**
 * Cuánto se queda la pantalla del penal tras el ÚLTIMO resultado de un partido antes de ceder a la tabla
 * (o al resultado ranked), medido desde que LLEGÓ ese resultado: jugada + cartel completo. Así el
 * resultado se ve siempre `resultCardS` sin depender del poll (feedback 3 #12).
 */
export const MATCH_RESULT_LINGER_MS = Math.round((TIMING.revealS + TIMING.resultCardS) * 1000);

/**
 * Cuánto falta para soltar la pantalla del penal (ms, ≤0 = ya). `lastResultAt` = instante local en que
 * llegó el último resultado (0 = no vimos ninguno: se suelta enseguida).
 */
export function lingerWaitMs(lastResultAt: number, now: number): number {
  return lastResultAt > 0 ? lastResultAt + MATCH_RESULT_LINGER_MS - now : 0;
}

/** Margen para que el `penal:result` del último penal llegue aunque el poll vea antes el fin del partido. */
export const LATE_RESULT_GRACE_MS = 600;
