/**
 * Tablero de penales (feedback 2, P5) — fuente única para el HUD del penal y el resumen. Antes había
 * dos implementaciones y ninguna dibujaba los penales PENDIENTES: los círculos aparecían "ya llenos o
 * vacíos" según el resultado. Acá cada lado tiene sus `kicksPerSide` slots desde el arranque; en muerte
 * súbita se suma uno por par (los dos lados siempre con el mismo largo).
 */
export type DotState = "pending" | "scored" | "missed";

export interface PenaltyBoard {
  home: DotState[];
  away: DotState[];
}

/** `home`/`away`: penales ya resueltos de cada lado, en orden (true = gol). */
export function penaltyBoard(home: readonly boolean[], away: readonly boolean[], kicksPerSide: number): PenaltyBoard {
  const n = Math.max(kicksPerSide, home.length, away.length);
  const side = (kicks: readonly boolean[]): DotState[] =>
    Array.from({ length: n }, (_, i) => (i < kicks.length ? (kicks[i] ? "scored" : "missed") : "pending"));
  return { home: side(home), away: side(away) };
}

const LABEL: Record<DotState, string> = { pending: "pendiente", scored: "gol", missed: "errado" };

/** Texto accesible del tablero de un lado: "Penales de Argentina: gol, errado, pendiente…". */
export function boardLabel(team: string, states: readonly DotState[]): string {
  return `Penales de ${team}: ${states.map((s) => LABEL[s]).join(", ")}`;
}
