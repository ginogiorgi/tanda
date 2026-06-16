/**
 * Motor de torneo — **funciones puras y deterministas** (SPEC §4). Sin I/O: recibe estado +
 * seed y devuelve fixture/standings/bracket. La aleatoriedad (sorteo de desempates, mapeo) entra
 * por `seed`. Se testea con Vitest sin red (F6). Lo usa `start_tournament`/`advance_tournament`
 * (camino multijugador) y el modo invitado client-side (§8.4).
 *
 * 6.1: fixture round-robin de grupo + acumulación de puntos (victoria 3, empate 1, derrota 0).
 */

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
