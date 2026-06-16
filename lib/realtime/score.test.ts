import { describe, expect, it } from "vitest";
import {
  applyScoreUpdate,
  matchesInPhase,
  type ScoreboardState,
  type ScoreLivePayload,
} from "./score";

function payload(over: Partial<ScoreLivePayload> = {}): ScoreLivePayload {
  return {
    match_id: "m1",
    phase: "group",
    group_letter: "A",
    bracket_slot: 1,
    status: "in_progress",
    home_score: 0,
    away_score: 0,
    winner_participant_id: null,
    home: null,
    away: null,
    server_now: "2026-06-16T00:00:00.000Z",
    ...over,
  };
}

describe("applyScoreUpdate", () => {
  it("inserta un partido nuevo sin mutar el estado anterior", () => {
    const state: ScoreboardState = {};
    const next = applyScoreUpdate(state, payload());
    expect(next.m1?.status).toBe("in_progress");
    expect(state).toEqual({}); // inmutable
  });

  it("reemplaza con el más reciente por server_now", () => {
    let state: ScoreboardState = {};
    state = applyScoreUpdate(state, payload({ home_score: 1, server_now: "2026-06-16T00:00:01.000Z" }));
    state = applyScoreUpdate(state, payload({ home_score: 2, status: "finished", server_now: "2026-06-16T00:00:02.000Z" }));
    expect(state.m1?.home_score).toBe(2);
    expect(state.m1?.status).toBe("finished");
  });

  it("ignora un Broadcast que llega desordenado (más viejo que el guardado)", () => {
    let state: ScoreboardState = {};
    state = applyScoreUpdate(state, payload({ home_score: 5, server_now: "2026-06-16T00:00:05.000Z" }));
    state = applyScoreUpdate(state, payload({ home_score: 3, server_now: "2026-06-16T00:00:03.000Z" }));
    expect(state.m1?.home_score).toBe(5); // el viejo no pisa al nuevo
  });

  it("mantiene partidos distintos por separado", () => {
    let state: ScoreboardState = {};
    state = applyScoreUpdate(state, payload({ match_id: "m1" }));
    state = applyScoreUpdate(state, payload({ match_id: "m2", phase: "final" }));
    expect(Object.keys(state)).toHaveLength(2);
  });
});

describe("matchesInPhase", () => {
  it("filtra por fase", () => {
    let state: ScoreboardState = {};
    state = applyScoreUpdate(state, payload({ match_id: "m1", phase: "semis" }));
    state = applyScoreUpdate(state, payload({ match_id: "m2", phase: "semis" }));
    state = applyScoreUpdate(state, payload({ match_id: "m3", phase: "final" }));
    expect(matchesInPhase(state, "semis")).toHaveLength(2);
    expect(matchesInPhase(state, "final")).toHaveLength(1);
    expect(matchesInPhase(state, "group")).toHaveLength(0);
  });
});
