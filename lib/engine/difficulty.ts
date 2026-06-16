/**
 * Dificultad de cada penal según la fase del torneo y el índice del penal (§9.3 BRIEF) —
 * **pura y determinista**. Es **regla** del juego, así que vive en el motor TS (fuente de la
 * regla, corre el modo invitado §8.4) y se porta fiel a plpgsql (`tanda_penalty_difficulty`,
 * tarea 7.4) para el camino autoritativo, verificado por paridad — igual que `resolvePenalty`
 * y `botIntent` (decisión SPEC §1.2).
 *
 *   | Fase                                       | Penales 1-3 | Penales 4-5 |
 *   |--------------------------------------------|-------------|-------------|
 *   | group                                      | easy        | medium      |
 *   | round_of_32 / round_of_16 / quarters       | medium      | hard        |
 *   | semis / third_place / final                | hard        | very_hard   |
 *
 * La muerte súbita (idx > 5) reusa el tramo alto de su fase (la final → very_hard, etc.).
 */

/** Niveles de dificultad (enum `difficulty` de la DB, SPEC §2.1). */
export type Difficulty = "easy" | "medium" | "hard" | "very_hard";

/** Fases de un partido (enum `match_phase` de la DB, SPEC §2.1). */
export type Phase =
  | "group"
  | "round_of_32"
  | "round_of_16"
  | "quarters"
  | "semis"
  | "third_place"
  | "final";

/** Tramo de dificultad por fase: [penales 1-3, penales 4-5 (y muerte súbita)]. */
const PHASE_DIFFICULTY: Record<Phase, [Difficulty, Difficulty]> = {
  group: ["easy", "medium"],
  round_of_32: ["medium", "hard"],
  round_of_16: ["medium", "hard"],
  quarters: ["medium", "hard"],
  semis: ["hard", "very_hard"],
  third_place: ["hard", "very_hard"],
  final: ["hard", "very_hard"],
};

/**
 * Dificultad del penal `idx` (1-based) en una `phase`. Los penales 1-3 usan el tramo bajo de la
 * fase; el 4, el 5 y la muerte súbita (idx > 5) usan el tramo alto.
 */
export function penaltyDifficulty(phase: Phase, idx: number): Difficulty {
  const [low, high] = PHASE_DIFFICULTY[phase];
  return idx <= 3 ? low : high;
}
