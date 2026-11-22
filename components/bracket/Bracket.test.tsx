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

describe("Bracket — fase de zonas/grupos (feedback 3 #3, feedback 4 #17–19)", () => {
  it("Argentino: las dos zonas lado a lado como Zona A y Zona B, sin rótulos de fase, la tuya marcada", () => {
    render(<Bracket view={buildBracketView(snap("arg", ["B", "A"]), {})} />);
    const grid = screen.getByTestId("zones-grid");
    const zones = Array.from(grid.querySelectorAll<HTMLElement>("[data-zone]"));
    expect(zones.map((z) => z.dataset.zone)).toEqual(["A", "B"]);
    for (const z of zones) expect(within(z).getByText("Pts")).toBeTruthy();
    expect(grid.querySelectorAll("[data-mine]")).toHaveLength(1);
    expect(within(grid).getByText(/^Zona A/)).toBeTruthy();
    expect(within(grid).getByText(/^Zona B/)).toBeTruthy();
    expect(screen.queryByText(/tu zona|la otra zona|fase de zonas/i)).toBeNull();
    expect(screen.queryByRole("link", { name: /ir a mi/i })).toBeNull();
  });

  it("Mundial: los 12 grupos iguales (todos con Pts), A→L, el tuyo marcado y atajo a tu grupo", () => {
    const letters = ["L", "K", "J", "I", "H", "G", "F", "E", "D", "C", "B", "A"];
    render(<Bracket view={buildBracketView(snap("worldcup", letters), {})} />);
    const grid = screen.getByTestId("zones-grid");
    const zones = Array.from(grid.querySelectorAll<HTMLElement>("[data-zone]"));
    expect(zones.map((z) => z.dataset.zone)).toEqual([...letters].reverse());
    for (const z of zones) expect(within(z).getByText("Pts")).toBeTruthy();
    const mine = grid.querySelectorAll<HTMLElement>("[data-mine]");
    expect(mine).toHaveLength(1);
    expect(screen.getByRole("link", { name: `Ir a mi grupo (${mine[0]!.dataset.zone})` })).toHaveAttribute(
      "href",
      `#zona-${mine[0]!.dataset.zone}`,
    );
    expect(screen.queryByText(/otros grupos|fase de grupos/i)).toBeNull();
  });
});
