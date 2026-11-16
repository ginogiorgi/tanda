import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DivisionProgress } from "./DivisionProgress";

function bar(): HTMLElement {
  return screen.getByRole("progressbar");
}

describe("DivisionProgress", () => {
  it("1500 pts: Ascenso, a 100 de Primera, barra al 33%", () => {
    render(<DivisionProgress rating={1500} />);
    expect(screen.getByText("Ascenso")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "División Ascenso" })).toBeInTheDocument();
    expect(screen.getByText("1500 pts")).toBeInTheDocument();
    expect(screen.getByText("→ Primera en 100")).toBeInTheDocument();
    expect(bar()).toHaveAccessibleName("Progreso a Primera");
    expect(bar()).toHaveAttribute("aria-valuenow", "33");
  });

  it("borde: a 1 punto de subir sigue en la división de abajo con la barra casi llena", () => {
    render(<DivisionProgress rating={1599} />);
    expect(screen.getByText("Ascenso")).toBeInTheDocument();
    expect(screen.getByText("→ Primera en 1")).toBeInTheDocument();
    expect(bar()).toHaveAttribute("aria-valuenow", "99");
  });

  it("borde: justo en el piso sube de división y la barra arranca en 0", () => {
    render(<DivisionProgress rating={1600} />);
    expect(screen.getByText("Primera")).toBeInTheDocument();
    expect(screen.getByText("→ Libertadores en 150")).toBeInTheDocument();
    expect(bar()).toHaveAttribute("aria-valuenow", "0");
  });

  it("Potrero no tiene piso: la barra arranca 300 debajo de Barrio", () => {
    render(<DivisionProgress rating={1150} />);
    expect(screen.getByText("Potrero")).toBeInTheDocument();
    expect(screen.getByText("→ Barrio en 150")).toBeInTheDocument();
    expect(bar()).toHaveAttribute("aria-valuenow", "50");
  });

  it("Leyenda es la división máxima: barra llena y sin próxima", () => {
    render(<DivisionProgress rating={2050} />);
    expect(screen.getByText("Leyenda")).toBeInTheDocument();
    expect(bar()).toHaveAccessibleName("División máxima");
    expect(bar()).toHaveAttribute("aria-valuenow", "100");
    expect(screen.queryByText(/→/)).not.toBeInTheDocument();
  });

  it("muestra el escudo de descenso solo si hay", () => {
    const { rerender } = render(<DivisionProgress rating={1500} shield={2} />);
    expect(screen.getByText("→ Primera en 100 · Escudo 2/3")).toBeInTheDocument();
    rerender(<DivisionProgress rating={1500} shield={0} />);
    expect(screen.queryByText(/Escudo/)).not.toBeInTheDocument();
  });
});
