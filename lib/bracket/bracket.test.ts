import { describe, expect, it } from "vitest";
import type { MatchPhase, ParticipantBrief, ScoreLivePayload } from "@/lib/realtime/score";
import {
  buildBracketView,
  type BracketFormat,
  type BracketSnapshot,
  type BracketTeam,
} from "./bracket";

function brief(id: string): ParticipantBrief {
  return {
    participant_id: id,
    user_id: `u-${id}`,
    is_bot: false,
    team_id: `n-${id}`,
    team_code: id.toUpperCase(),
    team_name: id,
    team_short: id,
    flag: id,
    crest: null,
    kit_primary: "#123456",
    kit_secondary: "#abcdef",
    kit_tertiary: null,
    kit_pattern: "solid",
    accent: "#123456",
  };
}

function team(id: string, group: string, over: Partial<BracketTeam> = {}): BracketTeam {
  return {
    ...brief(id),
    group_letter: group,
    placement: null,
    eliminated_phase: null,
    ...over,
  };
}

function gm(
  id: string,
  group: string,
  home: string,
  away: string,
  hs: number,
  as_: number,
  status: ScoreLivePayload["status"] = "finished",
  ts = "2026-06-17T00:00:00Z",
): ScoreLivePayload {
  return {
    match_id: id,
    phase: "group",
    group_letter: group,
    bracket_slot: 1,
    status,
    home_score: hs,
    away_score: as_,
    winner_participant_id: hs > as_ ? home : as_ > hs ? away : null,
    home: brief(home),
    away: brief(away),
    server_now: ts,
  };
}

function ko(
  id: string,
  phase: MatchPhase,
  slot: number,
  home: string,
  away: string,
  status: ScoreLivePayload["status"] = "pending",
): ScoreLivePayload {
  return {
    match_id: id,
    phase,
    group_letter: null,
    bracket_slot: slot,
    status,
    home_score: 0,
    away_score: 0,
    winner_participant_id: null,
    home: brief(home),
    away: brief(away),
    server_now: "2026-06-17T00:00:00Z",
  };
}

const WC_FORMAT: BracketFormat = {
  qualifiers_per_zone: 2,
  best_thirds: 8,
  knockout_start: "round_of_32",
  third_place: true,
  tiebreak: "gd_h2h",
};

const ARG_FORMAT: BracketFormat = {
  qualifiers_per_zone: 8,
  best_thirds: 0,
  knockout_start: "round_of_16",
  third_place: false,
  tiebreak: "goals",
};

// Grupo A: a1 gana todo, a2 segundo, a3/a4 abajo. yo = a2.
function snapshot(over: Partial<BracketSnapshot> = {}): BracketSnapshot {
  return {
    tournament_id: "t1",
    mode_id: "worldcup",
    format: WC_FORMAT,
    my_participant_id: "a2",
    current_phase: "groups",
    round_deadline: null,
    champion_participant_id: null,
    participants: [team("a1", "A"), team("a2", "A"), team("a3", "A"), team("a4", "A")],
    matches: [
      gm("m1", "A", "a1", "a2", 3, 1),
      gm("m2", "A", "a1", "a3", 2, 0),
      gm("m3", "A", "a2", "a3", 1, 0),
      gm("m4", "A", "a1", "a4", 4, 0),
      gm("m5", "A", "a2", "a4", 2, 0),
      gm("m6", "A", "a3", "a4", 1, 1),
    ],
    ...over,
  };
}

describe("buildBracketView", () => {
  it("rankea el grupo (puntos→DG→GF) y marca 'vos'", () => {
    const v = buildBracketView(snapshot(), {});
    expect(v.groups).toHaveLength(1);
    const rows = v.groups[0]!.rows;
    expect(rows.map((r) => r.team.participant_id)).toEqual(["a1", "a2", "a3", "a4"]);
    expect(rows[0]!.position).toBe(1);
    expect(rows.find((r) => r.isMe)!.team.participant_id).toBe("a2");
    expect(v.myGroupLetter).toBe("A");
  });

  it("marca desenlace: 1-2 clasifican, 3 repechaje, 4 afuera (en vivo)", () => {
    const rows = buildBracketView(snapshot(), {}).groups[0]!.rows;
    expect(rows[0]!.outcome).toBe("qualifies");
    expect(rows[1]!.outcome).toBe("qualifies");
    expect(rows[2]!.outcome).toBe("playoff");
    expect(rows[3]!.outcome).toBe("out");
  });

  it("respeta eliminated_phase cuando los grupos cerraron", () => {
    const snap = snapshot({
      participants: [
        team("a1", "A"),
        team("a2", "A"),
        team("a3", "A", { eliminated_phase: "group" }),
        team("a4", "A", { eliminated_phase: "group" }),
      ],
    });
    const rows = buildBracketView(snap, {}).groups[0]!.rows;
    expect(rows.find((r) => r.team.participant_id === "a3")!.outcome).toBe("out");
    expect(rows.find((r) => r.team.participant_id === "a1")!.outcome).toBe("qualifies");
  });

  it("ordena el KO por fase y slot y detecta 'isMe'", () => {
    const snap = snapshot({
      current_phase: "round_of_32",
      matches: [
        ko("k2", "round_of_16", 0, "a2", "b1"),
        ko("k1b", "round_of_32", 1, "x1", "x2"),
        ko("k1a", "round_of_32", 0, "a2", "z9"),
      ],
    });
    const v = buildBracketView(snap, {});
    expect(v.ko.map((p) => p.phase)).toEqual(["round_of_32", "round_of_16"]);
    expect(v.ko[0]!.matches.map((m) => m.match.match_id)).toEqual(["k1a", "k1b"]);
    expect(v.ko[0]!.matches[0]!.isMe).toBe(true);
    expect(v.ko[0]!.matches[1]!.isMe).toBe(false);
  });

  it("myNextMatch = el partido activo más temprano donde juego", () => {
    const snap = snapshot({
      current_phase: "round_of_32",
      matches: [
        ko("k-r16", "round_of_16", 0, "a2", "b1", "pending"),
        ko("k-r32", "round_of_32", 0, "a2", "z9", "in_progress"),
      ],
    });
    expect(buildBracketView(snap, {}).myNextMatch?.match_id).toBe("k-r32");
  });

  it("el vivo (score:live) pisa la foto inicial por match_id", () => {
    const live = {
      m1: gm("m1", "A", "a1", "a2", 1, 5, "finished", "2026-06-17T00:05:00Z"),
    };
    const rows = buildBracketView(snapshot(), live).groups[0]!.rows;
    // a2 ahora le ganó a a1 5-1 → a2 sube; el GF/DG cambia el orden de cabeza.
    expect(rows[0]!.team.participant_id).toBe("a2");
  });

  it("Argentina: los interzonales suman en cada zona y no hay repechaje", () => {
    const inter: ScoreLivePayload = { ...gm("i1", "A", "a4", "b1", 5, 0), group_letter: null };
    const v = buildBracketView(
      snapshot({
        mode_id: "arg",
        format: ARG_FORMAT,
        participants: [team("a1", "A"), team("a2", "A"), team("a3", "A"), team("a4", "A"), team("b1", "B")],
        matches: [gm("m1", "A", "a1", "a2", 1, 0), inter],
      }),
      {},
    );
    expect(v.mode.id).toBe("arg");
    const a = v.groups.find((g) => g.letter === "A")!.rows;
    // a4 ganó el interzonal con 5 penales: mismos 3 pts que a1 pero más convertidos → primero.
    expect(a.map((r) => r.team.participant_id).slice(0, 2)).toEqual(["a4", "a1"]);
    expect(a.every((r) => r.outcome === "qualifies")).toBe(true); // pasan 8, nadie en repechaje
    const b = v.groups.find((g) => g.letter === "B")!.rows;
    expect(b[0]!.standing.lost).toBe(1);
  });
});
