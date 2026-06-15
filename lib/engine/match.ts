/**
 * Lógica del partido (tanda de penales) — **pura y determinista**. Orquesta la secuencia de
 * penales sobre el resultado de cada uno (GOL = el pateador convirtió). No corre
 * `resolvePenalty` ni toca red: dado el marcador parcial, dice quién patea ahora, si el
 * partido sigue / se decidió / va a muerte súbita, y el resultado final. Ver SPEC §3.2 / §5.3.
 *
 * Formato (decisión 2026-06-15, resuelve la contradicción §3.2 vs §5.3): **5 penales por
 * lado = 10 en regulación**, alternados como en un Mundial real. `home` patea los índices
 * impares (1,3,5,7,9), `away` los pares (2,4,6,8,10). Solo el pateador puede convertir.
 *   - Grupos: se juegan los 10; puede terminar empatado (puntos 3/1/0).
 *   - Eliminación: corta apenas el resultado está matemáticamente decidido; si quedan iguales
 *     tras los 5 de cada uno → muerte súbita (rondas de a uno por lado hasta que se rompa).
 */

/** Lado del partido. */
export type MatchSide = "home" | "away";

/** Tipo de partido a efectos de reglas (grupos permite empate; eliminación define ganador). */
export type MatchKind = "group" | "elimination";

/** Penales por lado en regulación. */
export const KICKS_PER_SIDE = 5;
/** Penales de regulación (5 por lado). */
export const REGULATION_PENALTIES = KICKS_PER_SIDE * 2;

/** Estado del partido tras los penales jugados hasta ahora. */
export type MatchState =
  | { status: "in_progress"; nextIndex: number; nextKicker: MatchSide }
  | { status: "sudden_death"; nextIndex: number; nextKicker: MatchSide }
  | {
      status: "finished";
      home: number;
      away: number;
      /** Ganador, o `null` si empató (solo posible en grupos). */
      winner: MatchSide | null;
    };

/** Quién patea el penal `index` (1-based): impar = home, par = away. */
export function kickerAt(index: number): MatchSide {
  return index % 2 === 1 ? "home" : "away";
}

interface Tally {
  home: number;
  away: number;
  homeKicks: number;
  awayKicks: number;
}

/** Cuenta goles y patadas por lado a partir de los resultados ordenados (penal 1..N). */
function tally(scored: readonly boolean[]): Tally {
  let home = 0;
  let away = 0;
  let homeKicks = 0;
  let awayKicks = 0;
  scored.forEach((didScore, i) => {
    if (kickerAt(i + 1) === "home") {
      homeKicks += 1;
      if (didScore) home += 1;
    } else {
      awayKicks += 1;
      if (didScore) away += 1;
    }
  });
  return { home, away, homeKicks, awayKicks };
}

function finished(t: Tally): MatchState {
  const winner: MatchSide | null =
    t.home > t.away ? "home" : t.away > t.home ? "away" : null;
  return { status: "finished", home: t.home, away: t.away, winner };
}

function suddenDeath(n: number): MatchState {
  return { status: "sudden_death", nextIndex: n + 1, nextKicker: kickerAt(n + 1) };
}

/**
 * Calcula el estado del partido dada la lista ordenada de resultados (`scored[i]` = el
 * pateador del penal `i+1` convirtió). `kind` decide empate (grupos) vs corte/muerte súbita
 * (eliminación).
 */
export function advanceMatch(kind: MatchKind, scored: readonly boolean[]): MatchState {
  const t = tally(scored);
  const n = scored.length;

  // Regulación todavía en curso.
  if (n < REGULATION_PENALTIES) {
    if (kind === "elimination") {
      // Corte por resultado matemáticamente decidido (la perdedora no alcanza ni metiendo todo).
      const homeRemaining = KICKS_PER_SIDE - t.homeKicks;
      const awayRemaining = KICKS_PER_SIDE - t.awayKicks;
      if (t.home > t.away + awayRemaining) return finished(t);
      if (t.away > t.home + homeRemaining) return finished(t);
    }
    return { status: "in_progress", nextIndex: n + 1, nextKicker: kickerAt(n + 1) };
  }

  // Fin de regulación (n === 10).
  if (n === REGULATION_PENALTIES) {
    if (t.home !== t.away) return finished(t);
    if (kind === "group") return finished(t); // empate permitido en grupos
    return suddenDeath(n); // eliminación empatada → muerte súbita
  }

  // Muerte súbita (n > 10, solo eliminación). Se decide al cerrar una ronda completa
  // (ambos patearon): si el marcador difiere, gana; si sigue igual, otra ronda.
  const suddenDeathKicks = n - REGULATION_PENALTIES;
  const roundComplete = suddenDeathKicks % 2 === 0;
  if (roundComplete && t.home !== t.away) return finished(t);
  return suddenDeath(n);
}

/** Puntos de grupo según el resultado (victoria 3, empate 1, derrota 0). */
export function groupPoints(
  home: number,
  away: number,
): { home: number; away: number } {
  if (home > away) return { home: 3, away: 0 };
  if (away > home) return { home: 0, away: 3 };
  return { home: 1, away: 1 };
}
