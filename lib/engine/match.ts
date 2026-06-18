/**
 * Lógica del partido (tanda de penales) — **pura y determinista**. Orquesta la secuencia de
 * penales sobre el resultado de cada uno (GOL = el pateador convirtió). No corre
 * `resolvePenalty` ni toca red: dado el marcador parcial, dice quién patea ahora, si el
 * partido sigue / se decidió / va a muerte súbita, y el resultado final. Ver SPEC §3.2 / §5.3.
 *
 * Formato (F10 10.4): **grupos = 3 penales por lado (6 en regulación); eliminación = 5 por lado
 * (10 en regulación)**, alternados como en un Mundial real. `home` patea los índices impares
 * (1,3,5,…), `away` los pares (2,4,6,…). Solo el pateador puede convertir.
 *   - Grupos: se juegan los 6; puede terminar empatado (puntos 3/1/0).
 *   - Eliminación: si quedan iguales tras los 5 de cada uno → muerte súbita (rondas de a uno por
 *     lado hasta que se rompa).
 *   - Ambas fases (F10 10.9): el partido CORTA apenas el resultado está matemáticamente decidido
 *     (el que va perdiendo no alcanza ni convirtiendo todos los que le quedan).
 */

/** Lado del partido. */
export type MatchSide = "home" | "away";

/** Tipo de partido a efectos de reglas (grupos permite empate; eliminación define ganador). */
export type MatchKind = "group" | "elimination";

/** Penales por lado en regulación, por fase (10.4): grupos 3, eliminación 5. */
function kicksPerSide(kind: MatchKind): number {
  return kind === "group" ? 3 : 5;
}

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
  const kps = kicksPerSide(kind);
  const regulation = kps * 2;
  const t = tally(scored);
  const n = scored.length;

  // Regulación todavía en curso.
  if (n < regulation) {
    // Corte por resultado matemáticamente decidido (10.9), en AMBAS fases: la perdedora no
    // alcanza ni convirtiendo todos los que le quedan.
    const homeRemaining = kps - t.homeKicks;
    const awayRemaining = kps - t.awayKicks;
    if (t.home > t.away + awayRemaining) return finished(t);
    if (t.away > t.home + homeRemaining) return finished(t);
    return { status: "in_progress", nextIndex: n + 1, nextKicker: kickerAt(n + 1) };
  }

  // Fin de regulación (n === regulation).
  if (n === regulation) {
    if (t.home !== t.away) return finished(t);
    if (kind === "group") return finished(t); // empate permitido en grupos
    return suddenDeath(n); // eliminación empatada → muerte súbita
  }

  // Muerte súbita (n > regulation, solo eliminación). Se decide al cerrar una ronda completa
  // (ambos patearon): si el marcador difiere, gana; si sigue igual, otra ronda.
  const suddenDeathKicks = n - regulation;
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
