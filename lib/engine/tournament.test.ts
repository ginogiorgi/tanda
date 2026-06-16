import { describe, it, expect } from "vitest";
import {
  roundRobinSchedule,
  tallyGroup,
  type GroupMatchResult,
} from "./tournament";

describe("roundRobinSchedule", () => {
  it("4 equipos → 3 jornadas × 2 partidos = 6 enfrentamientos únicos", () => {
    const rounds = roundRobinSchedule(["A", "B", "C", "D"]);
    expect(rounds).toHaveLength(3);
    for (const day of rounds) expect(day).toHaveLength(2);

    const pairs = rounds.flat().map(([a, b]) => [a, b].sort().join("-"));
    expect(new Set(pairs).size).toBe(6); // todos contra todos, sin repetir
  });

  it("cada equipo juega exactamente 3 veces (una contra cada rival)", () => {
    const rounds = roundRobinSchedule(["A", "B", "C", "D"]);
    const count: Record<string, number> = {};
    for (const [a, b] of rounds.flat()) {
      count[a] = (count[a] ?? 0) + 1;
      count[b] = (count[b] ?? 0) + 1;
    }
    expect(count).toEqual({ A: 3, B: 3, C: 3, D: 3 });
  });

  it("es determinista", () => {
    expect(roundRobinSchedule(["A", "B", "C", "D"])).toEqual(
      roundRobinSchedule(["A", "B", "C", "D"]),
    );
  });

  it("rechaza cantidad impar", () => {
    expect(() => roundRobinSchedule(["A", "B", "C"])).toThrow();
  });
});

describe("tallyGroup", () => {
  const teams = ["A", "B", "C", "D"];

  it("reparte 3/1/0 y calcula GF/GC/DG", () => {
    const results: GroupMatchResult<string>[] = [
      { home: "A", away: "B", homeGoals: 2, awayGoals: 1 }, // A gana
      { home: "C", away: "D", homeGoals: 0, awayGoals: 0 }, // empate
    ];
    const table = tallyGroup(teams, results);
    const get = (t: string) => table.find((s) => s.team === t)!;
    expect(get("A").points).toBe(3);
    expect(get("A").goalDiff).toBe(1);
    expect(get("B").points).toBe(0);
    expect(get("C").points).toBe(1);
    expect(get("D").points).toBe(1);
    expect(get("D").goalDiff).toBe(0);
  });

  it("incluye equipos sin partidos jugados (en cero)", () => {
    const table = tallyGroup(teams, []);
    expect(table).toHaveLength(4);
    for (const s of table) {
      expect(s.played).toBe(0);
      expect(s.points).toBe(0);
    }
  });

  it("acumula varios partidos por equipo", () => {
    const results: GroupMatchResult<string>[] = [
      { home: "A", away: "B", homeGoals: 1, awayGoals: 0 },
      { home: "A", away: "C", homeGoals: 3, awayGoals: 3 },
      { home: "A", away: "D", homeGoals: 0, awayGoals: 2 },
    ];
    const a = tallyGroup(teams, results).find((s) => s.team === "A")!;
    expect(a.played).toBe(3);
    expect(a.won).toBe(1);
    expect(a.drawn).toBe(1);
    expect(a.lost).toBe(1);
    expect(a.points).toBe(4);
    expect(a.goalsFor).toBe(4);
    expect(a.goalsAgainst).toBe(5);
    expect(a.goalDiff).toBe(-1);
  });

  it("rechaza resultados con equipos ajenos al grupo", () => {
    expect(() =>
      tallyGroup(teams, [{ home: "A", away: "Z", homeGoals: 1, awayGoals: 0 }]),
    ).toThrow();
  });
});
