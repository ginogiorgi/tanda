import { describe, expect, it } from "vitest";
import { FORMATS, rankZone, roundRobin, seedOrder, zoneFixture, zoneKnockout, zoneLetters } from "./formats";
import { roundRobinSchedule } from "./tournament";

describe("roundRobin (método del círculo con libre)", () => {
  it("n=4 reproduce el fixture histórico del Mundial", () => {
    expect(roundRobin(4, 3)).toEqual([
      { md: 1, home: 1, away: 4 },
      { md: 1, home: 2, away: 3 },
      { md: 2, home: 1, away: 3 },
      { md: 2, home: 4, away: 2 },
      { md: 3, home: 1, away: 2 },
      { md: 3, home: 3, away: 4 },
    ]);
  });

  it("coincide con roundRobinSchedule (motor previo) para n par", () => {
    const legacy = roundRobinSchedule([1, 2, 3, 4, 5, 6]).flatMap((day, d) =>
      day.map(([h, a]) => `${d + 1}:${[h, a].sort().join("-")}`),
    );
    const now = roundRobin(6, 5).map((p) => `${p.md}:${[p.home, p.away].sort().join("-")}`);
    expect(now.sort()).toEqual(legacy.sort());
  });

  it("n=15, 5 fechas: 7 partidos + 1 libre por fecha, nadie repite rival ni juega dos veces", () => {
    const rr = roundRobin(15, 5);
    const seen = new Set<string>();
    for (let md = 1; md <= 5; md++) {
      const day = rr.filter((p) => p.md === md);
      expect(day.filter((p) => p.away === 0)).toHaveLength(1);
      expect(day.filter((p) => p.away > 0)).toHaveLength(7);
      const teams = day.flatMap((p) => (p.away ? [p.home, p.away] : [p.home]));
      expect(new Set(teams).size).toBe(15);
      for (const p of day.filter((x) => x.away > 0)) {
        const k = [p.home, p.away].sort((a, b) => a - b).join("-");
        expect(seen.has(k)).toBe(false);
        seen.add(k);
      }
    }
    // libres distintos en cada fecha
    expect(new Set(rr.filter((p) => p.away === 0).map((p) => p.home)).size).toBe(5);
  });
});

describe("seedOrder", () => {
  it("siembra estándar", () => {
    expect(seedOrder(1)).toEqual([1]);
    expect(seedOrder(4)).toEqual([1, 4, 2, 3]);
    expect(seedOrder(8)).toEqual([1, 8, 4, 5, 2, 7, 3, 6]);
  });
});

describe("zoneFixture — Argentina (2×15, 5 fechas, interzonal de libres)", () => {
  const cfg = FORMATS.arg;
  const zones = zoneLetters(2).map((z) => Array.from({ length: 15 }, (_, i) => `${z}${i + 1}`));
  const fx = zoneFixture(cfg, zones);

  it("75 partidos: 15 por fecha (7+7 de zona + 1 interzonal) y los 30 juegan todas las fechas", () => {
    expect(fx).toHaveLength(75);
    for (let md = 1; md <= 5; md++) {
      const day = fx.filter((m) => m.md === md);
      expect(day).toHaveLength(15);
      expect(day.filter((m) => m.zone === null)).toHaveLength(1);
      expect(new Set(day.flatMap((m) => [m.home, m.away])).size).toBe(30);
    }
  });

  it("el interzonal cruza A con B", () => {
    for (const m of fx.filter((x) => x.zone === null)) {
      expect([m.home[0], m.away[0]].sort()).toEqual(["A", "B"]);
    }
  });
});

describe("zoneFixture — Mundial (12×4)", () => {
  it("72 partidos, sin interzonales", () => {
    const zones = zoneLetters(12).map((z) => [1, 2, 3, 4].map((i) => `${z}${i}`));
    const fx = zoneFixture(FORMATS.worldcup, zones);
    expect(fx).toHaveLength(72);
    expect(fx.some((m) => m.zone === null)).toBe(false);
  });
});

describe("rankZone — desempate argentino (puntos → penales convertidos → moneda)", () => {
  it("con igualdad de puntos gana quien convirtió más penales, aunque tenga peor diferencia", () => {
    const t = rankZone(
      "goals",
      ["X", "Y", "Z"],
      [
        { home: "X", away: "Z", homeGoals: 3, awayGoals: 2 }, // X 3 pts, gf 3
        { home: "Y", away: "Z", homeGoals: 1, awayGoals: 0 }, // Y 3 pts, gf 1
      ],
      1,
    );
    expect(t.map((s) => s.team)).toEqual(["X", "Y", "Z"]);
  });

  it("los interzonales suman para el equipo de la zona y el rival de afuera no aparece", () => {
    const t = rankZone("goals", ["A1", "A2"], [{ home: "A1", away: "B9", homeGoals: 2, awayGoals: 0 }], 7);
    expect(t.map((s) => s.team)).toEqual(["A1", "A2"]);
    expect(t[0]!.points).toBe(3);
  });

  it("empate total → moneda determinista por seed (estable, y cambia con el seed)", () => {
    const a = rankZone("goals", ["P", "Q", "R", "S"], [], 1).map((s) => s.team);
    expect(rankZone("goals", ["P", "Q", "R", "S"], [], 1).map((s) => s.team)).toEqual(a);
    const orders = new Set([1, 2, 3, 4, 5, 6].map((s) => rankZone("goals", ["P", "Q", "R", "S"], [], s).map((x) => x.team).join()));
    expect(orders.size).toBeGreaterThan(1);
  });
});

describe("zoneKnockout — octavos 1A–8B", () => {
  const A = Array.from({ length: 8 }, (_, i) => `A${i + 1}`);
  const B = Array.from({ length: 8 }, (_, i) => `B${i + 1}`);
  const ko = zoneKnockout(A, B, 8);

  it("8 cruces mejor-vs-peor de la otra zona, 1A y 1B en mitades opuestas", () => {
    expect(ko).toEqual([
      ["A1", "B8"],
      ["A4", "B5"],
      ["A2", "B7"],
      ["A3", "B6"],
      ["B1", "A8"],
      ["B4", "A5"],
      ["B2", "A7"],
      ["B3", "A6"],
    ]);
  });
});
