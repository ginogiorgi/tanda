import { describe, it, expect } from "vitest";
import {
  roundRobinSchedule,
  tallyGroup,
  rankGroup,
  bestThirds,
  type GroupMatchResult,
  type Standing,
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

describe("rankGroup (desempates FIFA)", () => {
  const teams = ["A", "B", "C", "D"];

  it("ordena por puntos cuando no hay empate", () => {
    const results: GroupMatchResult<string>[] = [
      { home: "A", away: "B", homeGoals: 1, awayGoals: 0 },
      { home: "A", away: "C", homeGoals: 1, awayGoals: 0 },
      { home: "A", away: "D", homeGoals: 1, awayGoals: 0 },
      { home: "B", away: "C", homeGoals: 1, awayGoals: 0 },
      { home: "B", away: "D", homeGoals: 1, awayGoals: 0 },
      { home: "C", away: "D", homeGoals: 1, awayGoals: 0 },
    ];
    expect(rankGroup(teams, results, 1).map((s) => s.team)).toEqual([
      "A",
      "B",
      "C",
      "D",
    ]);
  });

  it("empate en puntos se rompe por diferencia de gol y luego goles a favor", () => {
    // A y B con 3 pts; A goleó (DG mayor) → A primero.
    const results: GroupMatchResult<string>[] = [
      { home: "A", away: "C", homeGoals: 5, awayGoals: 0 },
      { home: "B", away: "D", homeGoals: 1, awayGoals: 0 },
      { home: "A", away: "B", homeGoals: 0, awayGoals: 0 },
      { home: "C", away: "D", homeGoals: 0, awayGoals: 0 },
    ];
    const order = rankGroup(teams, results, 1).map((s) => s.team);
    expect(order[0]).toBe("A");
    expect(order[1]).toBe("B");
  });

  it("empatados en todo lo global → manda el head-to-head", () => {
    // A y B empatan pts/DG/GF globales, pero A le ganó a B → A primero.
    const results: GroupMatchResult<string>[] = [
      { home: "A", away: "B", homeGoals: 1, awayGoals: 0 }, // h2h: A gana
      { home: "A", away: "C", homeGoals: 0, awayGoals: 1 },
      { home: "B", away: "D", homeGoals: 1, awayGoals: 0 },
      { home: "A", away: "D", homeGoals: 0, awayGoals: 1 },
      { home: "B", away: "C", homeGoals: 0, awayGoals: 1 },
      { home: "C", away: "D", homeGoals: 0, awayGoals: 0 },
    ];
    const order = rankGroup(teams, results, 1).map((s) => s.team);
    expect(order.indexOf("A")).toBeLessThan(order.indexOf("B"));
  });

  it("empate total → sorteo determinista (mismo seed, mismo orden; estable)", () => {
    const results: GroupMatchResult<string>[] = []; // todos 0 pts, todo igual
    const o1 = rankGroup(teams, results, 42).map((s) => s.team);
    const o2 = rankGroup(teams, results, 42).map((s) => s.team);
    expect(o1).toEqual(o2);
    expect([...o1].sort()).toEqual(["A", "B", "C", "D"]); // es una permutación
  });
});

describe("bestThirds", () => {
  function third(team: string, points: number, gd: number, gf: number): Standing<string> {
    return {
      team,
      played: 3,
      won: 0,
      drawn: 0,
      lost: 0,
      goalsFor: gf,
      goalsAgainst: gf - gd,
      goalDiff: gd,
      points,
    };
  }

  it("toma los 8 mejores de 12 por puntos→DG→GF", () => {
    const thirds = Array.from({ length: 12 }, (_, i) =>
      third(`T${i}`, i, 0, 0),
    ); // T11 mejor … T0 peor
    const { qualified, eliminated } = bestThirds(thirds, 1);
    expect(qualified).toHaveLength(8);
    expect(eliminated).toHaveLength(4);
    expect(qualified.map((s) => s.team)).toEqual([
      "T11",
      "T10",
      "T9",
      "T8",
      "T7",
      "T6",
      "T5",
      "T4",
    ]);
    expect(eliminated.map((s) => s.team).sort()).toEqual(["T0", "T1", "T2", "T3"]);
  });

  it("desempata por sorteo determinista cuando son idénticos", () => {
    const thirds = Array.from({ length: 12 }, (_, i) => third(`T${i}`, 3, 0, 0));
    const q1 = bestThirds(thirds, 7).qualified.map((s) => s.team);
    const q2 = bestThirds(thirds, 7).qualified.map((s) => s.team);
    expect(q1).toEqual(q2);
    expect(q1).toHaveLength(8);
  });
});
