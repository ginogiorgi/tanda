import { describe, it, expect } from "vitest";
import { botIntent, TIER_MODEL, type DifficultyTier } from "./bot";

const TIERS: DifficultyTier[] = ["elite", "high", "medium", "low"];

describe("botIntent", () => {
  it("es determinista: mismo (tier, seed) → mismo resultado", () => {
    for (const tier of TIERS) {
      expect(botIntent(tier, 12345)).toEqual(botIntent(tier, 12345));
    }
  });

  it("delayMs siempre dentro de [minDelayMs, maxDelayMs] del tier", () => {
    for (const tier of TIERS) {
      const { minDelayMs, maxDelayMs } = TIER_MODEL[tier];
      for (let seed = 0; seed < 500; seed++) {
        const { delayMs } = botIntent(tier, seed);
        expect(delayMs).toBeGreaterThanOrEqual(minDelayMs);
        expect(delayMs).toBeLessThanOrEqual(maxDelayMs);
      }
    }
  });

  it("la tasa de acierto se aproxima a la del tier sobre muchos seeds", () => {
    const N = 20000;
    for (const tier of TIERS) {
      let correct = 0;
      for (let seed = 0; seed < N; seed++) {
        if (botIntent(tier, seed).willBeCorrect) correct++;
      }
      const rate = correct / N;
      // Tolerancia amplia: es un muestreo, no un valor exacto.
      expect(Math.abs(rate - TIER_MODEL[tier].accuracy)).toBeLessThan(0.03);
    }
  });

  it("tiers más altos aciertan más y responden más rápido (techo de velocidad)", () => {
    expect(TIER_MODEL.elite.accuracy).toBeGreaterThan(TIER_MODEL.low.accuracy);
    expect(TIER_MODEL.elite.maxDelayMs).toBeLessThan(TIER_MODEL.low.maxDelayMs);
  });
});
