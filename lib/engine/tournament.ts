/**
 * Motor de torneo — **funciones puras y deterministas** (SPEC §4). Sin I/O: recibe estado +
 * seed y devuelve fixture/standings/bracket. La aleatoriedad (sorteo de desempates, mapeo) entra
 * por `seed`. Se testea con Vitest sin red (F6). Lo usa `start_tournament`/`advance_tournament`
 * (camino multijugador) y el modo invitado client-side (§8.4).
 *
 * 6.1: fixture round-robin de grupo + acumulación de puntos (victoria 3, empate 1, derrota 0).
 */

import { makeRng } from "./rng";

/** Resultado de un partido de grupo (goles = penales convertidos en la tanda). */
export interface GroupMatchResult<T> {
  home: T;
  away: T;
  homeGoals: number;
  awayGoals: number;
}

/** Fila de la tabla de un equipo (sin ordenar; el orden con desempates es 6.2). */
export interface Standing<T> {
  team: T;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDiff: number;
  points: number;
}

/**
 * Fixture round-robin (método del círculo): cada equipo juega contra todos una vez. Devuelve las
 * jornadas (cada una con sus enfrentamientos). Para 4 equipos → 3 jornadas × 2 partidos = 6.
 * Determinista: mismo orden de entrada → mismo fixture. Requiere cantidad par de equipos.
 */
export function roundRobinSchedule<T>(teams: T[]): Array<Array<[T, T]>> {
  if (teams.length % 2 !== 0) {
    throw new Error("roundRobinSchedule requiere una cantidad par de equipos");
  }
  const n = teams.length;
  const arr = [...teams];
  const fixed = arr[0]!;
  let rot = arr.slice(1);
  const rounds: Array<Array<[T, T]>> = [];

  for (let r = 0; r < n - 1; r++) {
    const day: Array<[T, T]> = [[fixed, rot[rot.length - 1]!]];
    for (let i = 0; i < rot.length - 1; i += 2) {
      day.push([rot[i]!, rot[rot.length - 2 - i]!]);
    }
    rounds.push(day);
    // Rotación: el último pasa al frente (el fijo no se mueve).
    rot = [rot[rot.length - 1]!, ...rot.slice(0, rot.length - 1)];
  }
  return rounds;
}

/**
 * Acumula la tabla de un grupo a partir de los resultados (3/1/0). NO ordena (eso es 6.2 con
 * los desempates FIFA). Incluye a todos los equipos pasados, aunque no tengan resultados aún.
 */
export function tallyGroup<T>(teams: T[], results: GroupMatchResult<T>[]): Standing<T>[] {
  const table = new Map<T, Standing<T>>();
  for (const team of teams) {
    table.set(team, {
      team,
      played: 0,
      won: 0,
      drawn: 0,
      lost: 0,
      goalsFor: 0,
      goalsAgainst: 0,
      goalDiff: 0,
      points: 0,
    });
  }

  for (const m of results) {
    const home = table.get(m.home);
    const away = table.get(m.away);
    if (!home || !away) {
      throw new Error("Resultado con un equipo que no pertenece al grupo");
    }
    home.played++;
    away.played++;
    home.goalsFor += m.homeGoals;
    home.goalsAgainst += m.awayGoals;
    away.goalsFor += m.awayGoals;
    away.goalsAgainst += m.homeGoals;
    if (m.homeGoals > m.awayGoals) {
      home.won++;
      home.points += 3;
      away.lost++;
    } else if (m.homeGoals < m.awayGoals) {
      away.won++;
      away.points += 3;
      home.lost++;
    } else {
      home.drawn++;
      away.drawn++;
      home.points += 1;
      away.points += 1;
    }
  }

  for (const s of table.values()) {
    s.goalDiff = s.goalsFor - s.goalsAgainst;
  }
  return [...table.values()];
}

// ───────────────────────── 6.2: clasificación + desempates ─────────────────────────

/** Hash string → uint32 (FNV-1a), para derivar el sorteo determinista por equipo. */
function hashStr(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Sorteo determinista (último recurso, "drawing of lots" FIFA): clave [0,1) por equipo+seed. */
function drawKey(id: string, seed: number): number {
  return makeRng((seed ^ hashStr(id)) >>> 0)();
}

/** Comparador puntos → diferencia de gol → goles a favor (desc). 0 si empatan en los tres. */
function compareOverall(a: Standing<string>, b: Standing<string>): number {
  if (b.points !== a.points) return b.points - a.points;
  if (b.goalDiff !== a.goalDiff) return b.goalDiff - a.goalDiff;
  return b.goalsFor - a.goalsFor;
}

/**
 * Ordena un grupo aplicando desempates FIFA (SPEC §4): puntos → dif. gol → goles a favor →
 * (entre los empatados) h2h puntos → h2h dif. gol → h2h goles a favor → sorteo determinista por
 * seed. El head-to-head se calcula con una mini-tabla de SOLO los partidos entre los empatados.
 */
export function rankGroup(
  teams: string[],
  results: GroupMatchResult<string>[],
  seed: number,
): Standing<string>[] {
  const standings = tallyGroup(teams, results).sort(compareOverall);
  const out: Standing<string>[] = [];

  let i = 0;
  while (i < standings.length) {
    let j = i + 1;
    while (j < standings.length && compareOverall(standings[i]!, standings[j]!) === 0) j++;
    const tied = standings.slice(i, j);

    if (tied.length > 1) {
      const ids = tied.map((t) => t.team);
      const h2h = results.filter((m) => ids.includes(m.home) && ids.includes(m.away));
      const mini = new Map(tallyGroup(ids, h2h).map((s) => [s.team, s]));
      tied.sort((a, b) => {
        const c = compareOverall(mini.get(a.team)!, mini.get(b.team)!);
        return c !== 0 ? c : drawKey(a.team, seed) - drawKey(b.team, seed);
      });
    }
    out.push(...tied);
    i = j;
  }
  return out;
}

/**
 * Ranking de los 8 mejores terceros entre grupos (SPEC §4): puntos → dif. gol → goles a favor →
 * sorteo determinista (no hay h2h entre grupos distintos). Recibe los 12 terceros (uno por
 * grupo) y devuelve los 8 que clasifican + los 4 eliminados.
 */
export function bestThirds(
  thirds: Standing<string>[],
  seed: number,
): { qualified: Standing<string>[]; eliminated: Standing<string>[] } {
  const sorted = [...thirds].sort((a, b) => {
    const c = compareOverall(a, b);
    return c !== 0 ? c : drawKey(a.team, seed) - drawKey(b.team, seed);
  });
  return { qualified: sorted.slice(0, 8), eliminated: sorted.slice(8) };
}

// ───────────────────────── 6.3: bracket de eliminación ─────────────────────────

/** Posición de clasificación: 1 = ganador de grupo, 2 = segundo, 3 = mejor tercero. */
export type QualifiedSlot = 1 | 2 | 3;

/** Un clasificado a la fase final, con su grupo y posición (para el armado del bracket). */
export interface Qualified {
  team: string;
  group: string;
  slot: QualifiedSlot;
}

/** Fases de eliminación, en orden. */
export const KO_PHASES = [
  "round_of_32",
  "round_of_16",
  "quarters",
  "semis",
  "final",
] as const;
export type KoPhase = (typeof KO_PHASES)[number];

/**
 * Arma los 16 cruces de `round_of_32` a partir de los 32 clasificados (SPEC §4). Mapeo
 * determinista por seed que **evita que dos del mismo grupo se crucen de entrada**: cada ganador
 * de grupo enfrenta a un segundo/tercero de OTRO grupo; los restantes se emparejan también
 * evitando el mismo grupo. El orden del array es el orden del bracket (el ganador del cruce `i`
 * enfrenta al del `i+1` en la ronda siguiente; lo encadena `advanceBracket`).
 *
 * Nota: garantiza no-cruce de mismo grupo en `round_of_32`; la evitación en rondas más
 * profundas (estilo tabla oficial 2026) queda como refinamiento futuro.
 */
export function buildRoundOf32(qualified: Qualified[], seed: number): Array<[Qualified, Qualified]> {
  if (qualified.length !== 32) {
    throw new Error(`buildRoundOf32 requiere 32 clasificados, recibió ${qualified.length}`);
  }
  const key = (q: Qualified) => drawKey(q.team, seed);
  const winners = qualified.filter((q) => q.slot === 1).sort((a, b) => key(a) - key(b));
  const pool = qualified.filter((q) => q.slot !== 1).sort((a, b) => key(a) - key(b));
  const matches: Array<[Qualified, Qualified]> = [];

  const takeDifferentGroup = (group: string): Qualified => {
    const i = pool.findIndex((o) => o.group !== group);
    return pool.splice(i >= 0 ? i : 0, 1)[0]!;
  };

  for (const w of winners) matches.push([w, takeDifferentGroup(w.group)]);
  while (pool.length > 0) {
    const a = pool.shift()!;
    const b = takeDifferentGroup(a.group);
    matches.push([a, b]);
  }
  return matches;
}

/**
 * Encadena una fase de eliminación: dados los ganadores de la fase actual **en orden de
 * bracket**, arma los cruces de la siguiente (el ganador del cruce `2k` vs el del `2k+1`).
 */
export function advanceBracket<T>(winnersInOrder: T[]): Array<[T, T]> {
  if (winnersInOrder.length % 2 !== 0) {
    throw new Error("advanceBracket requiere una cantidad par de ganadores");
  }
  const next: Array<[T, T]> = [];
  for (let i = 0; i < winnersInOrder.length; i += 2) {
    next.push([winnersInOrder[i]!, winnersInOrder[i + 1]!]);
  }
  return next;
}
