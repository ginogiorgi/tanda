import { describe, it, expect } from "vitest";
import { penaltyDifficulty, type Difficulty, type Phase } from "./difficulty";

const ALL_PHASES: Phase[] = [
  "group",
  "round_of_32",
  "round_of_16",
  "quarters",
  "semis",
  "third_place",
  "final",
];

// Tramos esperados por fase: [penales 1-3, penales 4-5] (§9.3 BRIEF).
const EXPECTED: Record<Phase, [Difficulty, Difficulty]> = {
  group: ["easy", "medium"],
  round_of_32: ["medium", "hard"],
  round_of_16: ["medium", "hard"],
  quarters: ["medium", "hard"],
  semis: ["hard", "very_hard"],
  third_place: ["hard", "very_hard"],
  final: ["hard", "very_hard"],
};

describe("penaltyDifficulty", () => {
  it("penales 1-3 usan el tramo bajo de la fase", () => {
    for (const phase of ALL_PHASES) {
      for (let idx = 1; idx <= 3; idx++) {
        expect(penaltyDifficulty(phase, idx)).toBe(EXPECTED[phase][0]);
      }
    }
  });

  it("penales 4-5 usan el tramo alto de la fase", () => {
    for (const phase of ALL_PHASES) {
      for (let idx = 4; idx <= 5; idx++) {
        expect(penaltyDifficulty(phase, idx)).toBe(EXPECTED[phase][1]);
      }
    }
  });

  it("la muerte súbita (idx > 5) reusa el tramo alto", () => {
    for (const phase of ALL_PHASES) {
      for (let idx = 6; idx <= 10; idx++) {
        expect(penaltyDifficulty(phase, idx)).toBe(EXPECTED[phase][1]);
      }
    }
  });

  it("la final escala hasta very_hard en los últimos penales", () => {
    expect(penaltyDifficulty("final", 1)).toBe("hard");
    expect(penaltyDifficulty("final", 5)).toBe("very_hard");
  });

  it("la fase de grupos arranca en easy y no pasa de medium", () => {
    expect(penaltyDifficulty("group", 1)).toBe("easy");
    expect(penaltyDifficulty("group", 5)).toBe("medium");
  });
});
