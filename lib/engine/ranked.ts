/**
 * Ranked 1v1 (Fase 4b) — **regla pura y determinista** del rating de liga. Fuente de la regla; el
 * camino autoritativo es su port fiel a plpgsql (`ranked_apply_result`, `ranked_division`,
 * `ranked_difficulty`, `ranked_season_reset`), verificado por paridad en `supabase/tests/parity`.
 *
 *  · Elo con K variable: K=64 en partidas de ubicación (5 al empezar, 3 al arrancar cada temporada),
 *    K=32 después. Δ = round(K·(S−E)) con piso de ±4 para que toda partida se sienta. La asimetría
 *    que pidió Gino sale sola: el que gana "de punto" suma mucho; el favorito que pierde, resta mucho.
 *  · Divisiones con nombres futboleros (Potrero → Leyenda).
 *  · Escudo: al ascender de división, las 3 derrotas siguientes no te bajan (piso en el umbral).
 *  · Temporadas Apertura (ene–jun) / Clausura (jul–dic) con reset suave a mitad de camino de 1500.
 *
 * Redondeo: `Math.floor(x + 0.5)` (no `Math.round`) para que coincida bit a bit con
 * `floor(x + 0.5)` de Postgres también en los negativos.
 */

import type { Difficulty } from "./difficulty";

export const BASE_RATING = 1500;
export const PLACEMENT_GAMES = 5;
export const SEASON_PLACEMENT_GAMES = 3;
export const K_PLACEMENT = 64;
export const K_STANDARD = 32;
export const MIN_DELTA = 4;
export const SHIELD_LOSSES = 3;

export type DivisionId = "potrero" | "barrio" | "ascenso" | "primera" | "libertadores" | "leyenda";

export interface Division {
  id: DivisionId;
  name: string;
  /** Puntos mínimos de la división (inclusive). */
  min: number;
}

export const DIVISIONS: readonly Division[] = [
  { id: "potrero", name: "Potrero", min: 0 },
  { id: "barrio", name: "Barrio", min: 1300 },
  { id: "ascenso", name: "Ascenso", min: 1450 },
  { id: "primera", name: "Primera", min: 1600 },
  { id: "libertadores", name: "Libertadores", min: 1750 },
  { id: "leyenda", name: "Leyenda", min: 1900 },
];

/** Estado de liga de un jugador (lo que persiste `ranked_players`). */
export interface RankedState {
  rating: number;
  /** Partidas de ubicación que le quedan (K alto mientras > 0). */
  placementLeft: number;
  /** Derrotas protegidas que le quedan tras el último ascenso. */
  shield: number;
}

export interface RankedOutcome {
  state: RankedState;
  /** Cambio efectivo de puntos (ya con piso del escudo y sin bajar de 0). */
  delta: number;
  promoted: boolean;
  demoted: boolean;
  /** El escudo frenó una caída de división en esta derrota. */
  shieldSaved: boolean;
}

export function newPlayer(): RankedState {
  return { rating: BASE_RATING, placementLeft: PLACEMENT_GAMES, shield: 0 };
}

/** Probabilidad esperada de ganar de `rating` contra `opp` (Elo, escala 400). */
export function expectedScore(rating: number, opp: number): number {
  return 1 / (1 + Math.pow(10, (opp - rating) / 400));
}

/** Δ crudo de Elo (con el piso de ±MIN_DELTA), antes de escudo. */
export function ratingDelta(rating: number, opp: number, won: boolean, k: number): number {
  const raw = Math.floor(k * ((won ? 1 : 0) - expectedScore(rating, opp)) + 0.5);
  return won ? Math.max(raw, MIN_DELTA) : Math.min(raw, -MIN_DELTA);
}

export function divisionIndex(rating: number): number {
  let i = 0;
  for (let d = 0; d < DIVISIONS.length; d++) if (rating >= DIVISIONS[d]!.min) i = d;
  return i;
}

export function divisionFor(rating: number): Division {
  return DIVISIONS[divisionIndex(rating)]!;
}

/** Aplica el resultado de una partida. Puro: devuelve el estado nuevo y qué pasó. */
export function applyResult(s: RankedState, opp: number, won: boolean): RankedOutcome {
  const k = s.placementLeft > 0 ? K_PLACEMENT : K_STANDARD;
  const fromDiv = divisionIndex(s.rating);
  let rating = Math.max(0, s.rating + ratingDelta(s.rating, opp, won, k));
  let shield = s.shield;
  let shieldSaved = false;

  if (!won && shield > 0) {
    const floor = DIVISIONS[fromDiv]!.min;
    if (rating < floor) {
      rating = floor;
      shieldSaved = true;
    }
    shield -= 1;
  }

  const toDiv = divisionIndex(rating);
  const promoted = toDiv > fromDiv;
  if (promoted) shield = SHIELD_LOSSES;

  return {
    state: { rating, placementLeft: Math.max(0, s.placementLeft - 1), shield },
    delta: rating - s.rating,
    promoted,
    demoted: toDiv < fromDiv,
    shieldSaved,
  };
}

/** Lo que está en juego antes de patear: "Ganás +X · Perdés −Y". */
export function stakes(s: RankedState, opp: number): { win: number; loss: number } {
  return { win: applyResult(s, opp, true).delta, loss: applyResult(s, opp, false).delta };
}

export interface DivisionProgress {
  division: Division;
  next: Division | null;
  /** Puntos que faltan para la próxima división (0 en Leyenda). */
  toNext: number;
  /** Avance dentro de la división actual, 0..1 (1 en Leyenda). */
  fraction: number;
}

export function progressToNext(rating: number): DivisionProgress {
  const i = divisionIndex(rating);
  const division = DIVISIONS[i]!;
  const next = DIVISIONS[i + 1] ?? null;
  if (!next) return { division, next: null, toNext: 0, fraction: 1 };
  // Potrero no tiene piso real: la barra arranca 300 debajo de Barrio.
  const lo = i === 0 ? next.min - 300 : division.min;
  const fraction = Math.max(0, Math.min(1, (rating - lo) / (next.min - lo)));
  return { division, next, toNext: next.min - rating, fraction };
}

/** Reset suave de fin de temporada: a mitad de camino de 1500, con ubicación de nuevo. */
export function seasonReset(s: RankedState): RankedState {
  return {
    rating: BASE_RATING + Math.trunc((s.rating - BASE_RATING) / 2),
    placementLeft: SEASON_PLACEMENT_GAMES,
    shield: 0,
  };
}

/**
 * Dificultad de cada penal ranked según el rating PROMEDIO de los dos: las preguntas acompañan el
 * nivel. Primeros 3 penales por lado (idx ≤ 6) el tramo bajo; del 4º en adelante (y muerte súbita) el alto.
 */
export function rankedDifficulty(avgRating: number, idx: number): Difficulty {
  const band: readonly [Difficulty, Difficulty] =
    avgRating < 1600 ? ["easy", "medium"] : avgRating < 1900 ? ["medium", "hard"] : ["hard", "very_hard"];
  return idx <= 6 ? band[0] : band[1];
}

/** Ventana de rating aceptada según cuánto esperó el jugador en la cola (null = cualquiera). */
export function queueWindow(waitedSeconds: number): number | null {
  if (waitedSeconds < 10) return 100;
  if (waitedSeconds < 20) return 250;
  return null;
}

/** Temporada (por torneo real) de una fecha: Apertura ene–jun, Clausura jul–dic. */
export function seasonIdFor(d: Date): string {
  const half = d.getUTCMonth() < 6 ? "apertura" : "clausura";
  return `${half}-${d.getUTCFullYear()}`;
}

/** "clausura-2026" → "Clausura 2026". */
export function seasonName(id: string): string {
  const [half, year] = id.split("-");
  if (!half || !year) return id;
  return `${half.charAt(0).toUpperCase()}${half.slice(1)} ${year}`;
}
