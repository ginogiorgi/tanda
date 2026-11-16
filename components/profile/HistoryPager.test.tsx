import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import type { TournamentHistoryEntry } from "@/lib/profile/history";
import { HistoryPager } from "./HistoryPager";

/** Entradas con rival único por fila ("R01", "R02"…) para identificar qué página se ve. */
function entries(n: number): TournamentHistoryEntry[] {
  return Array.from({ length: n }, (_, i) => {
    const k = String(i + 1).padStart(2, "0");
    return {
      tournamentId: `t-${k}`,
      modeId: "worldcup",
      teamName: "Argentina",
      teamCode: "ARG",
      teamFlag: null,
      teamCrest: null,
      kitPrimary: "#75AADB",
      placement: null,
      eliminatedPhase: null,
      goalsFor: 3,
      matchesPlayed: 1,
      matchesWon: 1,
      abandoned: false,
      playedAt: `2026-11-${k}T12:00:00Z`,
      finalPhase: "group",
      finalMyScore: 3,
      finalOppScore: 2,
      finalOppTeamCode: `R${k}`,
      finalOppFlag: null,
      finalOppCrest: null,
      finalOppKitPrimary: "#000000",
      outcome: "won",
    };
  });
}

function visibleRivals(): string[] {
  return screen
    .getAllByRole("listitem")
    .map((li) => within(li).getByText(/^R\d\d$/).textContent ?? "");
}

const prev = () => screen.getByRole("button", { name: "← Anteriores" });
const next = () => screen.getByRole("button", { name: "Siguientes →" });

describe("HistoryPager", () => {
  it("con 5 o menos no pagina", () => {
    render(<HistoryPager entries={entries(5)} />);
    expect(screen.getAllByRole("listitem")).toHaveLength(5);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByText(/Página/)).not.toBeInTheDocument();
  });

  it("primera página: 5 filas y 'Anteriores' deshabilitado", () => {
    render(<HistoryPager entries={entries(12)} />);
    expect(visibleRivals()).toEqual(["R01", "R02", "R03", "R04", "R05"]);
    expect(screen.getByText("Página 1 de 3")).toBeInTheDocument();
    expect(prev()).toBeDisabled();
    expect(next()).toBeEnabled();
  });

  it("avanza hasta la última página (resto de 2) y ahí 'Siguientes' se deshabilita", async () => {
    const user = userEvent.setup();
    render(<HistoryPager entries={entries(12)} />);
    await user.click(next());
    expect(screen.getByText("Página 2 de 3")).toBeInTheDocument();
    expect(visibleRivals()).toEqual(["R06", "R07", "R08", "R09", "R10"]);
    await user.click(next());
    expect(screen.getByText("Página 3 de 3")).toBeInTheDocument();
    expect(visibleRivals()).toEqual(["R11", "R12"]);
    expect(next()).toBeDisabled();
    expect(prev()).toBeEnabled();
  });

  it("vuelve con 'Anteriores'", async () => {
    const user = userEvent.setup();
    render(<HistoryPager entries={entries(7)} />);
    await user.click(next());
    expect(visibleRivals()).toEqual(["R06", "R07"]);
    await user.click(prev());
    expect(screen.getByText("Página 1 de 2")).toBeInTheDocument();
    expect(visibleRivals()).toHaveLength(5);
  });

  it("si la lista se achica, no queda en una página que ya no existe", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<HistoryPager entries={entries(12)} />);
    await user.click(next());
    await user.click(next());
    rerender(<HistoryPager entries={entries(4)} />);
    expect(visibleRivals()).toEqual(["R01", "R02", "R03", "R04"]);
  });
});
