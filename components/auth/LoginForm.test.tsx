import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LoginForm } from "./LoginForm";

// Supabase y el router mockeados: el form solo ve `browserClient()` y `useNav()`.
const m = vi.hoisted(() => ({
  signInWithPassword: vi.fn<(args: { email: string; password: string }) => Promise<{ error: { message: string } | null }>>(),
  push: vi.fn<(href: string) => void>(),
  refresh: vi.fn<() => void>(),
}));

vi.mock("@/lib/supabase/lazy", () => ({
  browserClient: async () => ({ auth: { signInWithPassword: m.signInWithPassword } }),
}));
vi.mock("@/lib/nav/useNav", () => ({
  useNav: () => ({ push: m.push, refresh: m.refresh }),
}));

async function fillAndSubmit(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("Usuario"), "rosario");
  await user.type(screen.getByLabelText("Contraseña"), "secreta1");
  await user.click(screen.getByRole("button", { name: "Entrar" }));
}

describe("LoginForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("entra con el email sintético del usuario y navega a la home", async () => {
    m.signInWithPassword.mockResolvedValue({ error: null });
    const user = userEvent.setup();
    render(<LoginForm />);
    await fillAndSubmit(user);

    expect(m.signInWithPassword).toHaveBeenCalledTimes(1);
    const args = m.signInWithPassword.mock.calls[0]?.[0];
    expect(args?.password).toBe("secreta1");
    expect(args?.email).toMatch(/^rosario@/);
    expect(m.push).toHaveBeenCalledWith("/");
    expect(m.refresh).toHaveBeenCalled();
  });

  it("credenciales malas: muestra el error y no navega", async () => {
    m.signInWithPassword.mockResolvedValue({ error: { message: "Invalid login credentials" } });
    const user = userEvent.setup();
    render(<LoginForm />);
    await fillAndSubmit(user);

    expect(await screen.findByText("Usuario o contraseña incorrectos.")).toBeInTheDocument();
    expect(m.push).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Entrar" })).toBeEnabled();
  });

  it("mientras envía, el botón dice 'Entrando…' y queda deshabilitado", async () => {
    let resolve: (v: { error: null }) => void = () => undefined;
    m.signInWithPassword.mockReturnValue(new Promise((r) => (resolve = r)));
    const user = userEvent.setup();
    render(<LoginForm />);
    await fillAndSubmit(user);

    const busy = await screen.findByRole("button", { name: "Entrando…" });
    expect(busy).toBeDisabled();
    resolve({ error: null });
    expect(await screen.findByRole("button", { name: "Entrar" })).toBeEnabled();
  });

  it("links a recuperar contraseña y a registrarse", () => {
    render(<LoginForm />);
    expect(screen.getByRole("link", { name: "¿Olvidaste tu contraseña?" })).toHaveAttribute("href", "/forgot");
    expect(screen.getByRole("link", { name: "Registrate" })).toHaveAttribute("href", "/register");
  });
});
