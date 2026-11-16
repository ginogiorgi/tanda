import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { Field, Input } from "./Input";

describe("Input + Field", () => {
  it("el label queda asociado al input (se encuentra por label, como lo haría un lector)", () => {
    render(
      <Field label="Usuario" htmlFor="u">
        <Input id="u" />
      </Field>,
    );
    expect(screen.getByLabelText("Usuario")).toBeInstanceOf(HTMLInputElement);
  });

  it("se puede escribir y respeta disabled", async () => {
    render(
      <>
        <Field label="Activo" htmlFor="a">
          <Input id="a" />
        </Field>
        <Field label="Bloqueado" htmlFor="b">
          <Input id="b" disabled />
        </Field>
      </>,
    );
    await userEvent.type(screen.getByLabelText("Activo"), "hola");
    expect(screen.getByLabelText("Activo")).toHaveValue("hola");
    expect(screen.getByLabelText("Bloqueado")).toBeDisabled();
  });

  it("`invalid` no se filtra como atributo al DOM: se anuncia con aria-invalid", () => {
    const { rerender } = render(<Input aria-label="Código" invalid />);
    const input = screen.getByRole("textbox", { name: "Código" });
    expect(input).not.toHaveAttribute("invalid");
    expect(input).toBeInvalid();
    rerender(<Input aria-label="Código" />);
    expect(input).not.toHaveAttribute("aria-invalid");
  });

  it("muestra el hint, y el error lo reemplaza cuando hay", () => {
    const { rerender } = render(
      <Field label="Código" htmlFor="c" hint="6 letras">
        <Input id="c" />
      </Field>,
    );
    expect(screen.getByText("6 letras")).toBeInTheDocument();

    rerender(
      <Field label="Código" htmlFor="c" hint="6 letras" error="Esa sala no existe">
        <Input id="c" />
      </Field>,
    );
    expect(screen.getByText("Esa sala no existe")).toBeInTheDocument();
    expect(screen.queryByText("6 letras")).not.toBeInTheDocument();
  });
});
