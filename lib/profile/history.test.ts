import { describe, it, expect } from "vitest";
import {
  aggregateStats,
  EMPTY_STATS,
  type TournamentHistoryEntry,
} from "./history";

function entry(over: Partial<TournamentHistoryEntry>): TournamentHistoryEntry {
  return {
    tournamentId: "t",
    nationName: "Argentina",
    nationCode: "ARG",
    kitPrimary: "#6cace4",
    placement: null,
    eliminatedPhase: null,
    goalsFor: 0,
    matchesPlayed: 0,
    matchesWon: 0,
    abandoned: false,
    playedAt: "2026-06-15T00:00:00Z",
    finalPhase: null,
    finalMyScore: null,
    finalOppScore: null,
    finalOppNationCode: null,
    finalOppKitPrimary: null,
    outcome: null,
    ...over,
  };
}

describe("aggregateStats", () => {
  it("sin participaciones → todo en cero / null", () => {
    expect(aggregateStats([])).toEqual({
      titles: 0,
      winRate: 0,
      goals: 0,
      bestPlacement: null,
      tournamentsPlayed: 0,
    });
  });

  it("EMPTY_STATS es la agregación de la lista vacía", () => {
    expect(EMPTY_STATS).toEqual(aggregateStats([]));
  });

  it("suma títulos, goles y torneos jugados", () => {
    const stats = aggregateStats([
      entry({ placement: 1, goalsFor: 4 }),
      entry({ placement: 8, goalsFor: 2 }),
      entry({ placement: 1, goalsFor: 3 }),
    ]);
    expect(stats.titles).toBe(2);
    expect(stats.goals).toBe(9);
    expect(stats.tournamentsPlayed).toBe(3);
  });

  it("mejor posición = mínimo placement, ignorando los null (en curso)", () => {
    const stats = aggregateStats([
      entry({ placement: 16 }),
      entry({ placement: null }),
      entry({ placement: 3 }),
    ]);
    expect(stats.bestPlacement).toBe(3);
  });

  it("bestPlacement null si ningún torneo terminó", () => {
    expect(aggregateStats([entry({ placement: null })]).bestPlacement).toBeNull();
  });

  it("un torneo abandonado cuenta como jugado pero no como título ni mejor posición", () => {
    const stats = aggregateStats([
      entry({ placement: 1, goalsFor: 2, abandoned: true }),
      entry({ placement: 16, goalsFor: 1 }),
    ]);
    expect(stats.titles).toBe(0); // el bot ganó tras el abandono, no es tu título
    expect(stats.bestPlacement).toBe(16); // ignora el placement del abandonado
    expect(stats.goals).toBe(3); // los goles sí se cuentan
    expect(stats.tournamentsPlayed).toBe(2);
  });

  it("winRate = ganados / jugados (0 si no jugó partidos)", () => {
    const stats = aggregateStats([
      entry({ matchesPlayed: 4, matchesWon: 3 }),
      entry({ matchesPlayed: 6, matchesWon: 2 }),
    ]);
    expect(stats.winRate).toBeCloseTo(5 / 10);
    expect(aggregateStats([entry({})]).winRate).toBe(0);
  });
});
