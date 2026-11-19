import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { buildBracketView, type BracketFormat, type BracketSnapshot, type BracketTeam } from "@/lib/bracket/bracket";
import { Bracket } from "./Bracket";

function team(id: string, group: string): BracketTeam {
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
    group_letter: group,
    placement: null,
    eliminated_phase: null,
  };
}

const ARG: BracketFormat = { qualifiers_per_zone: 8, best_thirds: 0, knockout_start: "round_of_16", third_place: false, tiebreak: "goals" };
const WC: BracketFormat = { qualifiers_per_zone: 2, best_thirds: 8, knockout_start: "round_of_32", third_place: true, tiebreak: "gd_h2h" };

function snap(mode: "arg" | "worldcup", groups: string[]): BracketSnapshot {
  return {
    tournament_id: "t1",
    mode_id: mode,
    format: mode === "arg" ? ARG : WC,
    my_participant_id: `${groups[0]!.toLowerCase()}1`,
    current_phase: "groups",
    round_deadline: null,
    champion_participant_id: null,
    participants: groups.flatMap((g) => [1, 2, 3, 4].map((i) => team(`${g.toLowerCase()}${i}`, g))),
    matches: [],
  };
}

describe("Bracket — fase de zonas (feedback 3 #3)", () => {
  it("Argentino: las dos zonas lado a lado, mismo componente completo, la tuya marcada", () => {
    render(<Bracket view={buildBracketView(snap("arg", ["A", "B"]), {})} />);
    const grid = screen.getByTestId("zones-side-by-side");
    const zones = grid.querySelectorAll("[data-zone]");
    expect(zones).toHaveLength(2);
    // Ninguna en versión compacta: las dos muestran la columna de puntos y el W-D-L.
    for (const z of zones) expect(within(z as HTMLElement).getByText("Pts")).toBeTruthy();
    expect(grid.querySelectorAll("[data-mine]")).toHaveLength(1);
    expect(within(grid).getByText(/^Tu zona$/i)).toBeTruthy();
    expect(within(grid).getByText(/^La otra zona$/i)).toBeTruthy();
  });

  it("Mundial (muchos grupos) conserva su grilla", () => {
    render(<Bracket view={buildBracketView(snap("worldcup", ["A", "B", "C"]), {})} />);
    expect(screen.queryByTestId("zones-side-by-side")).toBeNull();
  });
});
