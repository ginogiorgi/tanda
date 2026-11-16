import { describe, expect, it } from "vitest";
import type { MatchPhase } from "@/lib/realtime/score";
import { nextRoundReady, tournamentView, type FlowFacts, type TournamentView } from "./flow";

const base: FlowFacts = {
  hasSnapshot: true,
  loadError: false,
  penalActive: false,
  revealExpired: true,
  me: { hasTeam: true, eliminatedPhase: null, placement: null },
  tournamentFinished: false,
  nextRoundReady: false,
  crossingsElapsed: false,
  championElapsed: false,
  spectating: false,
};
const v = (p: Partial<FlowFacts>): TournamentView => tournamentView({ ...base, ...p });
const out = (eliminatedPhase: MatchPhase | null, placement: number | null = null): Partial<FlowFacts> => ({
  me: { hasTeam: true, eliminatedPhase, placement },
});

describe("flujo del torneo", () => {
  it("entrar: revelación 2 s y después el bracket; un refresh tardío salta directo", () => {
    expect(v({ revealExpired: false })).toBe("reveal");
    expect(v({})).toBe("bracket");
    expect(v({ revealExpired: false, ...out("round_of_16") })).toBe("crossings");
  });

  it("carga y error", () => {
    expect(v({ hasSnapshot: false })).toBe("loading");
    expect(v({ hasSnapshot: false, loadError: true })).toBe("error");
  });

  it("el penal manda mientras mi partido está vivo (aunque ya figure eliminado: linger del último)", () => {
    expect(v({ penalActive: true })).toBe("penal");
    expect(v({ penalActive: true, ...out("round_of_32") })).toBe("penal");
  });

  it("perdí en KO: cruces hasta ≥4 s Y con la ronda siguiente armada; después el resumen", () => {
    expect(v({ ...out("round_of_16") })).toBe("crossings");
    expect(v({ ...out("round_of_16"), crossingsElapsed: true })).toBe("crossings");
    expect(v({ ...out("round_of_16"), nextRoundReady: true })).toBe("crossings");
    expect(v({ ...out("round_of_16"), crossingsElapsed: true, nextRoundReady: true })).toBe("summary");
  });

  it("afuera en grupos y subcampeón también pasan por los cruces", () => {
    expect(v({ ...out("group") })).toBe("crossings");
    expect(v({ ...out("final", 2) })).toBe("crossings");
    expect(v({ ...out("final", 2), crossingsElapsed: true, nextRoundReady: true })).toBe("summary");
  });

  it("campeón: 4 s de festejo y el resumen", () => {
    expect(v({ ...out(null, 1) })).toBe("champion");
    expect(v({ ...out(null, 1), championElapsed: true })).toBe("summary");
  });

  it("Ver cómo sigue → espectador; Ver mi resultado → resumen; fin del torneo → resumen", () => {
    const done = { ...out("quarters"), crossingsElapsed: true, nextRoundReady: true };
    expect(v({ ...done, spectating: true })).toBe("spectator");
    expect(v({ ...done, spectating: false })).toBe("summary");
    expect(v({ ...done, spectating: true, tournamentFinished: true })).toBe("summary");
  });

  it("ningún estado queda sin salida (todas las combinaciones llegan a una vista conocida)", () => {
    const bools = [true, false];
    const views = new Set<TournamentView>();
    for (const penalActive of bools)
      for (const crossingsElapsed of bools)
        for (const nextRound of bools)
          for (const spectating of bools)
            for (const placement of [null, 1, 2])
              views.add(v({ penalActive, crossingsElapsed, nextRoundReady: nextRound, spectating, me: { hasTeam: true, eliminatedPhase: placement === 2 ? "final" : null, placement } }));
    expect([...views].sort()).toEqual(["bracket", "champion", "crossings", "penal", "spectator", "summary"]);
  });
});

describe("¿está armada la ronda siguiente?", () => {
  it("octavos: lista cuando existen los cuartos", () => {
    expect(nextRoundReady("round_of_16", ["round_of_32", "round_of_16"], false)).toBe(false);
    expect(nextRoundReady("round_of_16", ["round_of_32", "round_of_16", "quarters"], false)).toBe(true);
  });
  it("grupos: lista cuando hay partidos de eliminación", () => {
    expect(nextRoundReady("group", ["group"], false)).toBe(false);
    expect(nextRoundReady("group", ["group", "round_of_32"], false)).toBe(true);
  });
  it("final / 3er puesto / torneo terminado: no hay ronda siguiente → listo", () => {
    expect(nextRoundReady("final", ["final"], false)).toBe(true);
    expect(nextRoundReady("third_place", ["final", "third_place"], false)).toBe(true);
    expect(nextRoundReady("quarters", ["quarters"], true)).toBe(true);
  });
});
