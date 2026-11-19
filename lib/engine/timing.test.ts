import { describe, expect, it } from "vitest";
import { TIER_MODEL } from "./bot";
import { FORMATS } from "./formats";
import { BALL_T1, BALL_T2 } from "@/lib/penal/shot";
import { lingerWaitMs, MATCH_RESULT_LINGER_MS, REVEAL_MS, TIMING } from "./timing";

describe("tiempos de juego (fuente única)", () => {
  it("todos los bots responden dentro del penal", () => {
    for (const m of Object.values(TIER_MODEL)) {
      expect(m.minDelayMs).toBeGreaterThan(0);
      expect(m.maxDelayMs).toBeLessThanOrEqual(TIMING.penaltyS * 1000);
    }
  });

  it("revelado: el cartel aparece cuando la pelota quedó quieta y dura 2,5 s (feedback 3 #2)", () => {
    expect(TIMING.revealS).toBe(BALL_T2);
    expect(REVEAL_MS).toBeGreaterThan(BALL_T1 * 1000); // nunca antes de que la pelota llegue
    expect(TIMING.resultCardS).toBe(2.5);
  });

  it("entre penales: el hueco del server es exactamente jugada + cartel", () => {
    expect(TIMING.betweenPenalsS * 1000).toBe(REVEAL_MS + TIMING.resultCardS * 1000);
  });

  it("entre partidos: jugada + cartel completo del último penal y ≥3 s de tabla con 1 s de poll", () => {
    expect(MATCH_RESULT_LINGER_MS).toBe(REVEAL_MS + TIMING.resultCardS * 1000);
    expect(MATCH_RESULT_LINGER_MS - REVEAL_MS).toBeGreaterThanOrEqual(2000); // #12: resultado ≥ 2 s
    expect(Math.round(TIMING.betweenMatchesS * 1000) - MATCH_RESULT_LINGER_MS - 1000).toBeGreaterThanOrEqual(3000);
  });

  it("linger anclado al último resultado, no al poll", () => {
    expect(lingerWaitMs(10_000, 10_000)).toBe(MATCH_RESULT_LINGER_MS);
    expect(lingerWaitMs(10_000, 10_000 + MATCH_RESULT_LINGER_MS)).toBe(0);
    expect(lingerWaitMs(10_000, 11_000)).toBe(MATCH_RESULT_LINGER_MS - 1000);
    expect(lingerWaitMs(0, 99_999)).toBe(0);
  });

  it("salas de 30 s en todos los modos (con amigos y partida rápida usan el mismo lobby)", () => {
    for (const f of Object.values(FORMATS)) expect(f.lobbyS).toBe(30);
  });

  it("valores positivos con a lo sumo un decimal (el SQL lee los huecos como float8 y el resto como int)", () => {
    const decimals = new Set(["revealS", "resultCardS", "betweenPenalsS", "betweenMatchesS"]);
    for (const [k, v] of Object.entries(TIMING)) {
      expect(v).toBeGreaterThan(0);
      expect(Math.round(v * 10)).toBeCloseTo(v * 10, 9);
      if (!decimals.has(k)) expect(Number.isInteger(v), k).toBe(true);
    }
  });
});
