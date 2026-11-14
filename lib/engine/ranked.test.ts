import { describe, expect, it } from "vitest";
import {
  applyResult,
  divisionFor,
  expectedScore,
  newPlayer,
  progressToNext,
  queueWindow,
  rankedDifficulty,
  ratingDelta,
  seasonIdFor,
  seasonName,
  seasonReset,
  stakes,
  DIVISIONS,
  MIN_DELTA,
} from "./ranked";

describe("ranked: Elo", () => {
  it("parejos → 50% y ±K/2", () => {
    expect(expectedScore(1500, 1500)).toBe(0.5);
    expect(ratingDelta(1500, 1500, true, 32)).toBe(16);
    expect(ratingDelta(1500, 1500, false, 32)).toBe(-16);
  });

  it("asimetría: el de abajo que gana suma más; el favorito que pierde resta más", () => {
    const underdogWin = ratingDelta(1400, 1700, true, 32);
    const favWin = ratingDelta(1700, 1400, true, 32);
    const favLoss = ratingDelta(1700, 1400, false, 32);
    expect(underdogWin).toBeGreaterThan(favWin);
    expect(-favLoss).toBeGreaterThan(favWin);
    expect(underdogWin).toBe(-favLoss); // suma cero
  });

  it("piso de ±4 aunque la diferencia sea enorme", () => {
    expect(ratingDelta(2400, 1000, true, 32)).toBe(MIN_DELTA);
    expect(ratingDelta(1000, 2400, false, 32)).toBe(-MIN_DELTA);
  });
});

describe("ranked: ubicación y escudo", () => {
  it("las 5 primeras mueven el doble", () => {
    const p = newPlayer();
    expect(applyResult(p, 1500, true).delta).toBe(32);
    const after = { ...p, placementLeft: 0 };
    expect(applyResult(after, 1500, true).delta).toBe(16);
    expect(applyResult(p, 1500, true).state.placementLeft).toBe(4);
  });

  it("ascender da escudo de 3 derrotas que no te bajan de división", () => {
    const s = { rating: 1590, placementLeft: 0, shield: 0 };
    const up = applyResult(s, 1590, true);
    expect(up.promoted).toBe(true);
    expect(divisionFor(up.state.rating).id).toBe("primera");
    expect(up.state.shield).toBe(3);

    let cur = up.state;
    for (let i = 0; i < 3; i++) {
      const r = applyResult(cur, cur.rating, false);
      expect(r.demoted).toBe(false);
      expect(r.state.rating).toBeGreaterThanOrEqual(1600);
      cur = r.state;
    }
    expect(cur.shield).toBe(0);
    expect(cur.rating).toBe(1600);
    const drop = applyResult(cur, cur.rating, false);
    expect(drop.demoted).toBe(true);
  });

  it("sin escudo se desciende normal; nunca baja de 0", () => {
    const r = applyResult({ rating: 1452, placementLeft: 0, shield: 0 }, 1452, false);
    expect(r.demoted).toBe(true);
    expect(applyResult({ rating: 2, placementLeft: 0, shield: 0 }, 2, false).state.rating).toBe(0);
  });

  it("stakes = lo que muestra el pre-partido", () => {
    expect(stakes({ rating: 1500, placementLeft: 0, shield: 0 }, 1500)).toEqual({ win: 16, loss: -16 });
  });
});

describe("ranked: divisiones y progreso", () => {
  it("umbrales", () => {
    expect(divisionFor(0).id).toBe("potrero");
    expect(divisionFor(1299).id).toBe("potrero");
    expect(divisionFor(1300).id).toBe("barrio");
    expect(divisionFor(1500).id).toBe("ascenso");
    expect(divisionFor(1899).id).toBe("libertadores");
    expect(divisionFor(3000).id).toBe("leyenda");
    expect(DIVISIONS).toHaveLength(6);
  });

  it("progreso a la siguiente", () => {
    const p = progressToNext(1525);
    expect(p.division.id).toBe("ascenso");
    expect(p.next?.id).toBe("primera");
    expect(p.toNext).toBe(75);
    expect(p.fraction).toBeCloseTo(0.5);
    expect(progressToNext(1950).next).toBeNull();
  });
});

describe("ranked: temporadas, cola y preguntas", () => {
  it("reset suave a mitad de camino de 1500 con 3 de ubicación", () => {
    expect(seasonReset({ rating: 1800, placementLeft: 0, shield: 2 })).toEqual({
      rating: 1650,
      placementLeft: 3,
      shield: 0,
    });
    expect(seasonReset({ rating: 1201, placementLeft: 0, shield: 0 }).rating).toBe(1351);
  });

  it("temporada por fecha", () => {
    expect(seasonIdFor(new Date("2026-11-13T00:00:00Z"))).toBe("clausura-2026");
    expect(seasonIdFor(new Date("2027-03-01T00:00:00Z"))).toBe("apertura-2027");
    expect(seasonName("apertura-2027")).toBe("Apertura 2027");
  });

  it("la ventana se abre con la espera", () => {
    expect(queueWindow(0)).toBe(100);
    expect(queueWindow(12)).toBe(250);
    expect(queueWindow(20)).toBeNull();
  });

  it("dificultad acompaña el nivel", () => {
    expect(rankedDifficulty(1500, 1)).toBe("easy");
    expect(rankedDifficulty(1500, 9)).toBe("medium");
    expect(rankedDifficulty(1700, 2)).toBe("medium");
    expect(rankedDifficulty(1950, 12)).toBe("very_hard");
  });
});
