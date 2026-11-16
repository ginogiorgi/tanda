import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Button } from "./Button";

describe("Button", () => {
  it("es un botón accesible por rol y nombre, type=button por defecto (no submitea forms)", () => {
    render(<Button>Jugar</Button>);
    const button = screen.getByRole("button", { name: "Jugar" });
    expect(button).toHaveAttribute("type", "button");
  });

  it("respeta type=submit", () => {
    render(<Button type="submit">Entrar</Button>);
    expect(screen.getByRole("button", { name: "Entrar" })).toHaveAttribute("type", "submit");
  });

  it("dispara onClick al tocarlo", async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Jugar</Button>);
    await userEvent.click(screen.getByRole("button", { name: "Jugar" }));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("deshabilitado: queda disabled y no dispara onClick", async () => {
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        Jugar
      </Button>,
    );
    const button = screen.getByRole("button", { name: "Jugar" });
    expect(button).toBeDisabled();
    await userEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });
});
