import { describe, expect, it } from "vitest";
import { boardLabel, penaltyBoard } from "./dots";

describe("tablero de penales", () => {
  it("arranca con todos los slots pendientes (5+5 en eliminación, 3+3 en grupos)", () => {
    expect(penaltyBoard([], [], 5)).toEqual({ home: Array(5).fill("pending"), away: Array(5).fill("pending") });
    expect(penaltyBoard([], [], 3).home).toHaveLength(3);
  });

  it("pinta cada slot recién cuando se resolvió ese penal", () => {
    expect(penaltyBoard([true], [], 5)).toEqual({
      home: ["scored", "pending", "pending", "pending", "pending"],
      away: ["pending", "pending", "pending", "pending", "pending"],
    });
    expect(penaltyBoard([true, false], [false], 3)).toEqual({
      home: ["scored", "missed", "pending"],
      away: ["missed", "pending", "pending"],
    });
  });

  it("muerte súbita: un slot más por par, los dos lados igual de largos", () => {
    const b = penaltyBoard([true, true, true, true, true, true], [true, true, true, true, true], 5);
    expect(b.home).toHaveLength(6);
    expect(b.away).toHaveLength(6);
    expect(b.away[5]).toBe("pending");
  });

  it("etiqueta accesible", () => {
    expect(boardLabel("Argentina", ["scored", "missed", "pending"])).toBe("Penales de Argentina: gol, errado, pendiente");
  });
});
