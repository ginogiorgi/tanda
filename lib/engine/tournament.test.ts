import { describe, it, expect } from "vitest";
import {
  roundRobinSchedule,
  tallyGroup,
  rankGroup,
  bestThirds,
  buildRoundOf32,
  advanceBracket,
  type GroupMatchResult,
  type Standing,
  type Qualified,
  type QualifiedSlot,
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

describe("buildRoundOf32 + advanceBracket", () => {
  // 32 clasificados: 12 ganadores (1) + 12 segundos (2) + 8 terceros (3).
  const groups = "ABCDEFGHIJKL".split("");
  const qualified: Qualified[] = [
    ...groups.map((g) => ({ team: `1${g}`, group: g, slot: 1 as QualifiedSlot })),
    ...groups.map((g) => ({ team: `2${g}`, group: g, slot: 2 as QualifiedSlot })),
    ...groups.slice(0, 8).map((g) => ({ team: `3${g}`, group: g, slot: 3 as QualifiedSlot })),
  ];

  it("arma 16 cruces con los 32 equipos, cada uno una sola vez", () => {
    const r32 = buildRoundOf32(qualified, 99);
    expect(r32).toHaveLength(16);
    const teams = r32.flat().map((q) => q.team);
    expect(teams).toHaveLength(32);
    expect(new Set(teams).size).toBe(32);
  });

  it("ningún cruce de round_of_32 enfrenta a dos del mismo grupo", () => {
    const r32 = buildRoundOf32(qualified, 99);
    for (const [a, b] of r32) expect(a.group).not.toBe(b.group);
  });

  it("ningún cruce del mismo grupo para 5000 seeds y distintos grupos de terceros (el greedy solo fallaba)", () => {
    for (let seed = 0; seed < 5000; seed++) {
      // Los 8 terceros salen de 8 grupos que rotan con el seed.
      const thirds = groups.filter((_, i) => (i + seed) % 12 < 8);
      const q: Qualified[] = [
        ...qualified.filter((x) => x.slot !== 3),
        ...thirds.map((g) => ({ team: `3${g}`, group: g, slot: 3 as QualifiedSlot })),
      ];
      const r32 = buildRoundOf32(q, seed);
      expect(new Set(r32.flat().map((x) => x.team)).size).toBe(32);
      for (const [a, b] of r32) expect(a.group, `seed ${seed}`).not.toBe(b.group);
    }
  });

  it("es determinista por seed", () => {
    expect(buildRoundOf32(qualified, 5)).toEqual(buildRoundOf32(qualified, 5));
  });

  it("rechaza un set distinto de 32", () => {
    expect(() => buildRoundOf32(qualified.slice(0, 30), 1)).toThrow();
  });

  it("advanceBracket empareja ganadores adyacentes (16→8)", () => {
    const winners = Array.from({ length: 16 }, (_, i) => `W${i}`);
    const next = advanceBracket(winners);
    expect(next).toHaveLength(8);
    expect(next[0]).toEqual(["W0", "W1"]);
    expect(next[7]).toEqual(["W14", "W15"]);
  });

  it("advanceBracket rechaza cantidad impar", () => {
    expect(() => advanceBracket(["W0", "W1", "W2"])).toThrow();
  });
});

describe("6.6 — torneo completo hasta el campeón (integración del motor)", () => {
  // Helper de test: resultado determinista de un partido (no es parte del motor).
  const strength = (team: string) => parseInt(team.slice(1), 10); // T00..T47 → 0..47
  function playGroup(teams: string[]): GroupMatchResult<string>[] {
    return roundRobinSchedule(teams)
      .flat()
      .map(([home, away]) => {
        const d = strength(home) - strength(away);
        return {
          home,
          away,
          homeGoals: d > 0 ? 2 : d < 0 ? 0 : 1,
          awayGoals: d < 0 ? 2 : d > 0 ? 0 : 1,
        };
      });
  }
  // Ganador de un cruce KO: el de mayor "strength" (determinista).
  const koWinner = (a: string, b: string) =>
    strength(a) >= strength(b) ? a : b;

  function runTournament(seed: number) {
    const teams = Array.from({ length: 48 }, (_, i) =>
      `T${String(i).padStart(2, "0")}`,
    );
    const groupLetters = "ABCDEFGHIJKL".split("");
    // Reparto round-robin: T_i → grupo i % 12 (cada grupo mezcla fuertes y débiles).
    const groups = new Map<string, string[]>();
    groupLetters.forEach((g) => groups.set(g, []));
    teams.forEach((t, i) => groups.get(groupLetters[i % 12]!)!.push(t));

    const winners: Qualified[] = [];
    const runners: Qualified[] = [];
    const thirds: Standing<string>[] = [];
    const thirdGroupOf = new Map<string, string>();

    for (const g of groupLetters) {
      const gt = groups.get(g)!;
      const ranked = rankGroup(gt, playGroup(gt), seed);
      winners.push({ team: ranked[0]!.team, group: g, slot: 1 });
      runners.push({ team: ranked[1]!.team, group: g, slot: 2 });
      thirds.push(ranked[2]!);
      thirdGroupOf.set(ranked[2]!.team, g);
    }

    const best = bestThirds(thirds, seed).qualified.map<Qualified>((s) => ({
      team: s.team,
      group: thirdGroupOf.get(s.team)!,
      slot: 3,
    }));

    const qualified = [...winners, ...runners, ...best];
    let round = buildRoundOf32(qualified, seed).map(
      ([a, b]) => [a.team, b.team] as [string, string],
    );
    const roundSizes: number[] = [];
    while (round.length > 1) {
      roundSizes.push(round.length);
      const w = round.map(([a, b]) => koWinner(a, b));
      round = advanceBracket(w);
    }
    roundSizes.push(round.length);
    const champion = koWinner(round[0]![0], round[0]![1]);
    return { qualifiedCount: qualified.length, roundSizes, champion };
  }

  it("48 equipos → 32 clasificados → bracket 16→8→4→2→1 → un campeón", () => {
    const r = runTournament(2026);
    expect(r.qualifiedCount).toBe(32);
    expect(r.roundSizes).toEqual([16, 8, 4, 2, 1]);
    expect(r.champion).toMatch(/^T\d{2}$/);
  });

  it("es reproducible con el mismo seed", () => {
    expect(runTournament(7)).toEqual(runTournament(7));
  });
});
