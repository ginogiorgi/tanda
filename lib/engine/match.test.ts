import { describe, it, expect } from "vitest";
import { advanceMatch, kickerAt, groupPoints } from "./match";

/** Interleavea los penales de home y away (1 home, 2 away, …). `n` por lado. */
function interleave(home: boolean[], away: boolean[], n: number): boolean[] {
  const out: boolean[] = [];
  for (let i = 0; i < n; i++) {
    out.push(home[i]!);
    out.push(away[i]!);
  }
  return out;
}
/** Regulación de eliminación (5 por lado). */
const reg = (home: boolean[], away: boolean[]) => interleave(home, away, 5);
/** Regulación de grupos (3 por lado). */
const reg3 = (home: boolean[], away: boolean[]) => interleave(home, away, 3);
const T = true;
const F = false;

describe("kickerAt", () => {
  it("impar = home, par = away (incluida la muerte súbita)", () => {
    expect(kickerAt(1)).toBe("home");
    expect(kickerAt(2)).toBe("away");
    expect(kickerAt(11)).toBe("home");
    expect(kickerAt(12)).toBe("away");
  });
});

describe("advanceMatch — arranque y regulación", () => {
  it("sin penales → in_progress, patea home el 1", () => {
    expect(advanceMatch("group", [])).toEqual({
      status: "in_progress",
      nextIndex: 1,
      nextKicker: "home",
    });
  });

  it("grupos: 3 por lado (6 en regulación); gana el de más goles", () => {
    const r = advanceMatch("group", reg3([T, T, T], [T, T, F]));
    expect(r).toEqual({ status: "finished", home: 3, away: 2, winner: "home" });
  });

  it("grupos: puede terminar empatado (winner null)", () => {
    const r = advanceMatch("group", reg3([T, F, F], [F, T, F]));
    expect(r).toEqual({ status: "finished", home: 1, away: 1, winner: null });
  });

  it("grupos: corta apenas el resultado está decidido (10.9)", () => {
    // home 2 - away 0 tras 4 penales (3 por lado): away no llega ni metiendo el que le queda.
    const r = advanceMatch("group", [T, F, T, F]);
    expect(r).toEqual({ status: "finished", home: 2, away: 0, winner: "home" });
  });

  it("grupos: no corta si todavía es alcanzable", () => {
    // home 2 - away 1 tras 4: away puede empatar con su último → sigue.
    const r = advanceMatch("group", [T, T, T, F]);
    expect(r).toMatchObject({ status: "in_progress", nextIndex: 5 });
  });
});

describe("advanceMatch — eliminación", () => {
  it("corta apenas el resultado está decidido (3-0 con 2 por patear cada uno)", () => {
    // 6 penales: home metió 3, away 0; away no llega ni metiendo los 2 que le quedan.
    const r = advanceMatch("elimination", [T, F, T, F, T, F]);
    expect(r).toEqual({ status: "finished", home: 3, away: 0, winner: "home" });
  });

  it("no corta si todavía es alcanzable", () => {
    // home 2 - away 1 tras 6: away puede empatar/ganar → sigue.
    const r = advanceMatch("elimination", [T, T, T, F, F, F]);
    expect(r).toMatchObject({ status: "in_progress", nextIndex: 7 });
  });

  it("empate tras los 5 de cada uno → muerte súbita (patea home)", () => {
    const r = advanceMatch("elimination", reg([T, T, T, F, F], [T, T, T, F, F]));
    expect(r).toEqual({ status: "sudden_death", nextIndex: 11, nextKicker: "home" });
  });
});

describe("advanceMatch — muerte súbita", () => {
  const tied = reg([T, T, T, F, F], [T, T, T, F, F]); // 3-3 al cerrar regulación

  it("media ronda (pateó home, falta away) NO decide aunque home meta", () => {
    const r = advanceMatch("elimination", [...tied, T]); // home mete en súbita
    expect(r).toEqual({ status: "sudden_death", nextIndex: 12, nextKicker: "away" });
  });

  it("ronda completa con diferencia → gana", () => {
    const r = advanceMatch("elimination", [...tied, T, F]); // home mete, away erra
    expect(r).toEqual({ status: "finished", home: 4, away: 3, winner: "home" });
  });

  it("ronda completa empatada → otra ronda", () => {
    const r = advanceMatch("elimination", [...tied, T, T]); // ambos meten
    expect(r).toEqual({ status: "sudden_death", nextIndex: 13, nextKicker: "home" });
  });
});

describe("groupPoints", () => {
  it("victoria 3 / empate 1 / derrota 0", () => {
    expect(groupPoints(3, 2)).toEqual({ home: 3, away: 0 });
    expect(groupPoints(1, 2)).toEqual({ home: 0, away: 3 });
    expect(groupPoints(2, 2)).toEqual({ home: 1, away: 1 });
  });
});
