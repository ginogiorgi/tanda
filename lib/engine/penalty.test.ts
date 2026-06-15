import { describe, it, expect } from "vitest";
import {
  resolvePenalty,
  type PlayerAnswer,
  type PenaltyContext,
} from "./penalty";

/** Respuesta con opción y tiempo (ms). `null` de opción = no respondió (timeout). */
function ans(optionIndex: number | null, selectedAt: number | null): PlayerAnswer {
  return { answered: optionIndex !== null, optionIndex, selectedAt };
}
const TIMEOUT: PlayerAnswer = { answered: false, optionIndex: null, selectedAt: null };

function ctx(over: Partial<PenaltyContext> = {}): PenaltyContext {
  return { correctIndex: 0, seed: 1, phase: "first", ...over };
}

describe("resolvePenalty — tabla §5.2 (primera fase)", () => {
  it("ambos bien, pateador más rápido → GOL (goal)", () => {
    const r = resolvePenalty(ans(0, 100), ans(0, 200), ctx());
    expect(r).toMatchObject({
      outcome: "resolved",
      winner: "kicker",
      scored: true,
      reason: "goal",
    });
  });

  it("ambos bien, arquero más rápido → ATAJADO (save)", () => {
    const r = resolvePenalty(ans(0, 300), ans(0, 200), ctx());
    expect(r).toMatchObject({ winner: "keeper", scored: false, reason: "save" });
  });

  it("pateador bien, arquero mal → GOL (goal)", () => {
    const r = resolvePenalty(ans(0, 500), ans(1, 100), ctx());
    expect(r).toMatchObject({ winner: "kicker", scored: true, reason: "goal" });
  });

  it("pateador mal, arquero bien → ATAJADO (miss_wide: la tiró afuera)", () => {
    const r = resolvePenalty(ans(1, 100), ans(0, 500), ctx());
    expect(r).toMatchObject({ winner: "keeper", scored: false, reason: "miss_wide" });
  });

  it("pateador bien, arquero timeout → GOL", () => {
    const r = resolvePenalty(ans(0, 400), TIMEOUT, ctx());
    expect(r).toMatchObject({ winner: "kicker", scored: true, reason: "goal" });
  });

  it("pateador timeout, arquero bien → ATAJADO (miss_wide)", () => {
    const r = resolvePenalty(TIMEOUT, ans(0, 400), ctx());
    expect(r).toMatchObject({ winner: "keeper", scored: false, reason: "miss_wide" });
  });

  it("ambos bien, mismo tiempo → desempate por seed (determinista) y depende del seed", () => {
    const r1 = resolvePenalty(ans(0, 250), ans(0, 250), ctx({ seed: 7 }));
    const r2 = resolvePenalty(ans(0, 250), ans(0, 250), ctx({ seed: 7 }));
    expect(r1).toEqual(r2); // mismo seed → mismo resultado

    const winners = new Set<string>();
    for (let s = 0; s < 60; s++) {
      const r = resolvePenalty(ans(0, 250), ans(0, 250), ctx({ seed: s }));
      if (r.outcome === "resolved") winners.add(r.winner);
    }
    expect(winners).toEqual(new Set(["kicker", "keeper"])); // ambos salen según seed
  });
});

describe("resolvePenalty — los dos mal", () => {
  it("primera fase → second_chance quitando una opción incorrecta", () => {
    const r = resolvePenalty(ans(1, 100), ans(2, 100), ctx({ correctIndex: 0 }));
    expect(r.outcome).toBe("second_chance");
    if (r.outcome === "second_chance") {
      expect([1, 2]).toContain(r.removedOption);
      expect(r.removedOption).not.toBe(0); // nunca se quita la correcta
    }
  });

  it("si ambos erraron la MISMA opción, esa es la que se quita", () => {
    const r = resolvePenalty(ans(2, 100), ans(2, 300), ctx({ correctIndex: 0 }));
    expect(r).toMatchObject({ outcome: "second_chance", removedOption: 2 });
  });

  it("ambos timeout (primera fase) → second_chance con opción incorrecta", () => {
    const r = resolvePenalty(TIMEOUT, TIMEOUT, ctx({ correctIndex: 1 }));
    expect(r.outcome).toBe("second_chance");
    if (r.outcome === "second_chance") {
      expect([0, 2]).toContain(r.removedOption);
    }
  });

  it("segunda chance, los dos mal de nuevo → ATAJADO (keeper, miss_wide)", () => {
    const r = resolvePenalty(
      ans(1, 100),
      ans(2, 100),
      ctx({ correctIndex: 0, phase: "second_chance" }),
    );
    expect(r).toMatchObject({ winner: "keeper", scored: false, reason: "miss_wide" });
  });

  it("segunda chance, pateador no responde → ATAJADO (keeper)", () => {
    const r = resolvePenalty(TIMEOUT, ans(1, 100), ctx({ correctIndex: 0, phase: "second_chance" }));
    expect(r).toMatchObject({ winner: "keeper", scored: false, reason: "miss_wide" });
  });

  it("segunda chance, pateador acierta → GOL", () => {
    const r = resolvePenalty(ans(0, 100), ans(1, 100), ctx({ correctIndex: 0, phase: "second_chance" }));
    expect(r).toMatchObject({ winner: "kicker", scored: true, reason: "goal" });
  });
});

describe("resolvePenalty — invariantes", () => {
  it("winner kicker ⇔ scored true; keeper ⇔ scored false", () => {
    const gol = resolvePenalty(ans(0, 100), ans(0, 200), ctx());
    const atajado = resolvePenalty(ans(1, 100), ans(0, 200), ctx());
    if (gol.outcome === "resolved") expect(gol.scored).toBe(gol.winner === "kicker");
    if (atajado.outcome === "resolved") expect(atajado.scored).toBe(atajado.winner === "kicker");
  });

  it("variant es estable por seed y está en rango [0,4)", () => {
    const a = resolvePenalty(ans(0, 100), ans(0, 200), ctx({ seed: 42 }));
    const b = resolvePenalty(ans(0, 100), ans(0, 200), ctx({ seed: 42 }));
    if (a.outcome === "resolved" && b.outcome === "resolved") {
      expect(a.variant).toBe(b.variant);
      expect(a.variant).toBeGreaterThanOrEqual(0);
      expect(a.variant).toBeLessThan(4);
    }
  });
});
