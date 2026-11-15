import { describe, expect, it } from "vitest";
import { TIER_MODEL } from "./bot";
import { FORMATS } from "./formats";
import { MATCH_RESULT_LINGER_MS, RANKED_RESULT_LINGER_MS, TIMING } from "./timing";

describe("tiempos de juego (fuente única)", () => {
  it("todos los bots responden dentro del penal", () => {
    for (const m of Object.values(TIER_MODEL)) {
      expect(m.minDelayMs).toBeGreaterThan(0);
      expect(m.maxDelayMs).toBeLessThanOrEqual(TIMING.penaltyS * 1000);
    }
  });

  it("la pausa del cliente entra en el hueco entre partidos dejando ≥3 s de tabla (≈1 s de poll)", () => {
    expect(MATCH_RESULT_LINGER_MS + 1000 + 3000).toBeLessThanOrEqual(TIMING.betweenMatchesS * 1000);
  });

  it("el resultado ranked se ve antes de que el GOL/ATAJADO pierda sentido (< hueco entre penales)", () => {
    expect(RANKED_RESULT_LINGER_MS).toBeLessThan(TIMING.betweenPenalsS * 1000);
  });

  it("salas de 30 s en todos los modos (con amigos y partida rápida usan el mismo lobby)", () => {
    for (const f of Object.values(FORMATS)) expect(f.lobbyS).toBe(30);
  });

  it("valores enteros positivos (el SQL los lee como int)", () => {
    for (const v of Object.values(TIMING)) {
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThan(0);
    }
  });
});
