/**
 * Formatos de torneo por MODO (Tanda 2.0) — funciones puras y deterministas. Es la fuente de la regla
 * que portan las RPC (`engine_round_robin`, `engine_seed_order`, `engine_group_standings`,
 * `build_knockout`); la paridad TS↔SQL se verifica en `supabase/tests/parity.test.ts`.
 *
 * Un formato = zonas × tamaño, fechas a jugar, clasificados por zona (+ mejores terceros opcional),
 * fase de arranque del KO, 3er puesto y criterio de desempate. Para zonas IMPARES, el libre de cada
 * fecha juega un interzonal contra el libre de la zona par siguiente (A↔B, C↔D…).
 */
import type { Phase } from "./difficulty";
import { rankGroup, tallyGroup, type GroupMatchResult, type Standing } from "./tournament";
import { makeRng } from "./rng";

export type ModeId = "worldcup" | "arg";
export type Tiebreak = "gd_h2h" | "goals";

export interface FormatConfig {
  roomSize: number;
  zones: number;
  zoneSize: number;
  matchdays: number;
  qualifiersPerZone: number;
  bestThirds: number;
  knockoutStart: Exclude<Phase, "group" | "third_place">;
  thirdPlace: boolean;
  tiebreak: Tiebreak;
  /** Espera de sala antes de llenar con bots (s). Espejo de `game_modes.lobby_seconds`. */
  lobbyS: number;
}

/** Espejo de `public.game_modes` (la DB es la autoridad; esto alimenta tests y UI). */
export const FORMATS: Record<ModeId, FormatConfig> = {
  worldcup: {
    roomSize: 48,
    zones: 12,
    zoneSize: 4,
    matchdays: 3,
    qualifiersPerZone: 2,
    bestThirds: 8,
    knockoutStart: "round_of_32",
    thirdPlace: true,
    tiebreak: "gd_h2h",
    lobbyS: 30,
  },
  arg: {
    roomSize: 30,
    zones: 2,
    zoneSize: 15,
    matchdays: 5,
    qualifiersPerZone: 8,
    bestThirds: 0,
    knockoutStart: "round_of_16",
    thirdPlace: false,
    tiebreak: "goals",
    lobbyS: 30,
  },
};

/** Letras de zona: A, B, C… */
export function zoneLetters(zones: number): string[] {
  return Array.from({ length: zones }, (_, i) => String.fromCharCode(65 + i));
}

export interface Pairing {
  md: number;
  home: number;
  /** 0 = libre (fecha sin rival en la zona). */
  away: number;
}

/**
 * Fixture por método del círculo sobre posiciones 1..n (n impar → fantasma n+1 = libre). Se fija la 1
 * y se rota el resto a la derecha; se empareja arr[i] vs arr[m-1-i]. Para n=4 reproduce el fixture
 * histórico del Mundial: (1-4, 2-3), (1-3, 4-2), (1-2, 3-4).
 */
export function roundRobin(n: number, rounds: number): Pairing[] {
  const m = n % 2 === 0 ? n : n + 1;
  const out: Pairing[] = [];
  const base = Array.from({ length: m - 1 }, (_, i) => i + 2);
  for (let r = 0; r < Math.min(rounds, m - 1); r++) {
    const k = r % (m - 1);
    const rest = k === 0 ? base : [...base.slice(base.length - k), ...base.slice(0, base.length - k)];
    const arr = [1, ...rest];
    for (let i = 0; i < m / 2; i++) {
      const a = arr[i]!;
      const b = arr[m - 1 - i]!;
      if (a > n) out.push({ md: r + 1, home: b, away: 0 });
      else if (b > n) out.push({ md: r + 1, home: a, away: 0 });
      else out.push({ md: r + 1, home: a, away: b });
    }
  }
  return out;
}

/** Orden de siembra estándar de un cuadro de `n` (potencia de 2): 4 → [1,4,2,3]; 8 → [1,8,4,5,2,7,3,6]. */
export function seedOrder(n: number): number[] {
  let cur = [1];
  let size = 1;
  while (size < n) {
    size *= 2;
    cur = cur.flatMap((x) => [x, size + 1 - x]);
  }
  return cur;
}

export interface FixtureMatch {
  md: number;
  /** null = interzonal. */
  zone: string | null;
  home: string;
  away: string;
}

/**
 * Fixture de la fase de zonas. `zonesTeams[z][pos-1]` = equipo en la posición `pos` de la zona `z`
 * (el sorteo de posiciones lo hace el caller). Incluye los interzonales de los libres.
 */
export function zoneFixture(cfg: FormatConfig, zonesTeams: string[][]): FixtureMatch[] {
  const letters = zoneLetters(cfg.zones);
  const pairs = roundRobin(cfg.zoneSize, cfg.matchdays);
  const out: FixtureMatch[] = [];
  zonesTeams.forEach((teams, zi) => {
    for (const p of pairs) {
      if (p.away > 0) out.push({ md: p.md, zone: letters[zi]!, home: teams[p.home - 1]!, away: teams[p.away - 1]! });
    }
  });
  if (cfg.zoneSize % 2 === 1) {
    const byes = pairs.filter((p) => p.away === 0);
    for (const b of byes) {
      for (let zi = 0; zi + 1 < zonesTeams.length; zi += 2) {
        const h = zonesTeams[zi]![b.home - 1]!;
        const a = zonesTeams[zi + 1]![b.home - 1]!;
        out.push(b.md % 2 === 1 ? { md: b.md, zone: null, home: h, away: a } : { md: b.md, zone: null, home: a, away: h });
      }
    }
  }
  return out;
}

function hashStr(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Moneda determinista por equipo (mismo `drawKey` que el Mundial: mulberry32(seed ^ fnv32(id))). */
export function coin(id: string, seed: number): number {
  return makeRng((seed ^ hashStr(id)) >>> 0)();
}

/**
 * Tabla de una zona. `results` puede incluir partidos contra equipos de otra zona (interzonales):
 * suman para el equipo de esta zona. Desempate por modo:
 *   gd_h2h (Mundial): puntos → dif. gol → goles → h2h → sorteo.
 *   goals  (Argentina): puntos → penales convertidos → moneda.
 */
export function rankZone(
  tiebreak: Tiebreak,
  teams: string[],
  results: GroupMatchResult<string>[],
  seed: number,
): Standing<string>[] {
  const ids = new Set(teams);
  const mine = results.filter((r) => ids.has(r.home) || ids.has(r.away));
  if (tiebreak === "gd_h2h") return rankGroup(teams, mine, seed);
  const table = tallyGroup([...new Set([...teams, ...mine.flatMap((r) => [r.home, r.away])])], mine).filter((s) =>
    ids.has(s.team),
  );
  return table.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;
    return coin(a.team, seed) - coin(b.team, seed);
  });
}

/**
 * Cruces de 2 zonas sin mejores terceros: 1A–nB, 2A–(n-1)B… en orden de siembra para cada lado, primero
 * la mitad de A y luego la de B, así 1A y 1B solo se pueden cruzar en la final.
 */
export function zoneKnockout(zoneA: string[], zoneB: string[], n: number): Array<[string, string]> {
  const order = seedOrder(n / 2);
  const side = (x: string[], y: string[]) => order.map((i) => [x[i - 1]!, y[n - i]!] as [string, string]);
  return [...side(zoneA, zoneB), ...side(zoneB, zoneA)];
}
