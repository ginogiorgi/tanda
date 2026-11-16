import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TimeBar } from "./TimeBar";

/** La barra interna (el relleno) es el único hijo del progressbar. */
function fill(): HTMLElement {
  const child = screen.getByRole("progressbar").firstElementChild;
  if (!(child instanceof HTMLElement)) throw new Error("TimeBar sin relleno");
  return child;
}

describe("TimeBar", () => {
  it("expone el tiempo restante como progressbar 0–100", () => {
    render(<TimeBar fraction={0.5} />);
    const bar = screen.getByRole("progressbar");
    expect(bar).toHaveAttribute("aria-valuemin", "0");
    expect(bar).toHaveAttribute("aria-valuemax", "100");
    expect(bar).toHaveAttribute("aria-valuenow", "50");
  });

  it.each([
    [1.7, "100"],
    [-0.4, "0"],
  ])("acota la fracción fuera de rango (%s → %s)", (fraction, now) => {
    render(<TimeBar fraction={fraction} />);
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", now);
  });

  it.each([
    [0.9, "bg-ink", false],
    [0.6, "bg-accent-orange", false],
    [0.3, "bg-danger", true],
  ])("con %s restante pinta %s (pulso urgente: %s)", (fraction, color, urgent) => {
    render(<TimeBar fraction={fraction} />);
    expect(fill()).toHaveClass(color);
    if (urgent) expect(fill()).toHaveClass("motion-safe:animate-pulse");
    else expect(fill()).not.toHaveClass("motion-safe:animate-pulse");
  });
});
