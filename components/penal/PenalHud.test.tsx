import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ParticipantBrief } from "@/lib/realtime/score";
import { PenalHud, type PenalDot } from "./PenalHud";

function brief(code: string, name: string, flag: string): ParticipantBrief {
  return {
    participant_id: `p-${code}`,
    user_id: null,
    is_bot: false,
    team_id: `t-${code}`,
    team_code: code,
    team_name: name,
    team_short: name,
    flag,
    crest: null,
    kit_primary: "#75AADB",
    kit_secondary: "#FFFFFF",
    kit_tertiary: null,
    kit_pattern: "vstripes",
    accent: null,
  };
}

const ARG = brief("ARG", "Argentina", "ar");
const BRA = brief("BRA", "Brasil", "br");

function hud(overrides: Partial<React.ComponentProps<typeof PenalHud>> = {}) {
  return render(
    <PenalHud
      home={ARG}
      away={BRA}
      homeScore={2}
      awayScore={1}
      idx={5}
      role={null}
      dots={[]}
      kicksPerSide={5}
      {...overrides}
    />,
  );
}

/** Códigos de equipo en orden de lectura (izquierda → derecha). */
function teamCodesInOrder(): string[] {
  return screen.getAllByText(/^(ARG|BRA|\?\?\?)$/).map((el) => el.textContent ?? "");
}

describe("PenalHud", () => {
  it("muestra 'Penal N de M' a partir del idx global (home impar / away par)", () => {
    hud({ idx: 5, kicksPerSide: 5 });
    expect(screen.getByText("Penal 3 de 5")).toBeInTheDocument();
  });

  it("pasados los penales reglamentarios es muerte súbita", () => {
    hud({ idx: 7, kicksPerSide: 3 });
    expect(screen.getByText("Muerte súbita")).toBeInTheDocument();
  });

  it("marcador y banderas accesibles de cada lado", () => {
    hud();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Bandera de Argentina" })).toHaveAttribute("src", "/flags/ar.svg");
    expect(screen.getByRole("img", { name: "Bandera de Brasil" })).toBeInTheDocument();
  });

  it.each([
    ["kick", "⚽ Pateás"],
    ["keep", "🧤 Atajás"],
  ] as const)("rol %s → badge '%s'", (role, label) => {
    hud({ role });
    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it("sin rol (espectador) no muestra badge", () => {
    hud({ role: null });
    expect(screen.queryByText(/Pateás|Atajás/)).not.toBeInTheDocument();
  });

  it("sin flip, home a la izquierda", () => {
    hud();
    expect(teamCodesInOrder()).toEqual(["ARG", "BRA"]);
  });

  it("flip (el caller es away): su país queda a la izquierda", () => {
    hud({ flip: true });
    expect(teamCodesInOrder()).toEqual(["BRA", "ARG"]);
  });

  it("sin brief muestra '???' y, sin penales pateados, todos los slots pendientes", () => {
    hud({ home: null, away: null, kicksPerSide: 3 });
    expect(teamCodesInOrder()).toEqual(["???", "???"]);
    const boards = screen.getAllByRole("img", { name: /^Penales de \?\?\?:/ });
    expect(boards).toHaveLength(2);
    expect(boards[0]).toHaveAccessibleName("Penales de ???: pendiente, pendiente, pendiente");
  });

  it("reparte los penales resueltos por lado según la paridad del idx", () => {
    const dots: PenalDot[] = [
      { idx: 1, scored: true },
      { idx: 2, scored: false },
      { idx: 3, scored: true },
    ];
    hud({ dots, kicksPerSide: 3 });
    // home patea los impares (1 y 3 → gol, gol), away los pares (2 → errado)
    expect(screen.getByRole("img", { name: /^Penales de Argentina/ })).toHaveAccessibleName(
      "Penales de Argentina: gol, gol, pendiente",
    );
    expect(screen.getByRole("img", { name: /^Penales de Brasil/ })).toHaveAccessibleName(
      "Penales de Brasil: errado, pendiente, pendiente",
    );
  });

  it("en muerte súbita los dos lados suman un slot", () => {
    const dots: PenalDot[] = Array.from({ length: 7 }, (_, i) => ({ idx: i + 1, scored: true }));
    hud({ dots, idx: 8, kicksPerSide: 3 });
    for (const team of ["Argentina", "Brasil"]) {
      expect(screen.getByRole("img", { name: new RegExp(`^Penales de ${team}`) }).querySelectorAll("[data-dot]")).toHaveLength(4);
    }
  });
});
