import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RegisterForm } from "./RegisterForm";

type AuthError = { message: string } | null;
type SignUpResult = {
  data: { user: { identities?: unknown[] } | null };
  error: AuthError;
};

const m = vi.hoisted(() => ({
  rpc: vi.fn<(fn: string, args: { check_name: string }) => Promise<{ data: boolean | null; error: AuthError }>>(),
  signUp: vi.fn<(args: { email: string; password: string; options?: { data?: Record<string, unknown> } }) => Promise<SignUpResult>>(),
  push: vi.fn<(href: string) => void>(),
  refresh: vi.fn<() => void>(),
}));

vi.mock("@/lib/supabase/lazy", () => ({
  browserClient: async () => ({ rpc: m.rpc, auth: { signUp: m.signUp } }),
}));
vi.mock("@/lib/nav/useNav", () => ({
  useNav: () => ({ push: m.push, refresh: m.refresh }),
}));

const usernameInput = () => screen.getByLabelText("Usuario");
const passwordInput = () => screen.getByLabelText("Contraseña");
const submit = () => screen.getByRole("button", { name: /Crear cuenta|Creando…/ });

/** jsdom no trae `<dialog>` modal: alcanza con abrir/cerrar. */
if (!HTMLDialogElement.prototype.showModal) {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    this.open = false;
  };
}

/** Elige club y país en los selectores buscables (feedback 3 #15). */
async function pickFavorites(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByTestId("fav-club"));
  await user.type(screen.getByRole("searchbox", { name: "Buscar club" }), "boca");
  await user.click(screen.getByRole("button", { name: /Boca Juniors/ }));
  await user.click(screen.getByTestId("fav-nation"));
  await user.click(screen.getByRole("button", { name: /^Argentina$|Bandera de Argentina Argentina/ }));
}

describe("RegisterForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.rpc.mockResolvedValue({ data: true, error: null });
    m.signUp.mockResolvedValue({ data: { user: { identities: [{}] } }, error: null });
    // Relojes falsos que igual avanzan: el debounce de 400 ms de un test no se filtra al siguiente.
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it("usuario inválido: error de formato y no llama al alta", async () => {
    const user = userEvent.setup();
    render(<RegisterForm />);
    await user.type(usernameInput(), "ab");
    await user.type(passwordInput(), "secreta1");
    await user.click(submit());

    expect(screen.getByText(/de 3 a 20 caracteres/)).toBeInTheDocument();
    expect(m.signUp).not.toHaveBeenCalled();
    expect(m.rpc).not.toHaveBeenCalled(); // inválido → ni siquiera chequea disponibilidad
  });

  it("contraseña corta: error y no llama al alta", async () => {
    const user = userEvent.setup();
    render(<RegisterForm />);
    await user.type(usernameInput(), "rosario");
    await user.type(passwordInput(), "12345");
    await user.click(submit());

    expect(screen.getByText("La contraseña necesita al menos 6 caracteres.")).toBeInTheDocument();
    expect(m.signUp).not.toHaveBeenCalled();
  });

  it("disponibilidad: chequea una sola vez tras el debounce y marca 'Disponible ✓'", async () => {
    const user = userEvent.setup();
    render(<RegisterForm />);
    await user.type(usernameInput(), "rosario");

    expect(screen.getByText("Chequeando…")).toBeInTheDocument();
    expect(await screen.findByText("Disponible ✓")).toBeInTheDocument();
    expect(m.rpc).toHaveBeenCalledTimes(1);
    expect(m.rpc).toHaveBeenCalledWith("username_available", { check_name: "rosario" });
  });

  it("usuario tomado: avisa, marca el input inválido y deshabilita el submit", async () => {
    m.rpc.mockResolvedValue({ data: false, error: null });
    const user = userEvent.setup();
    render(<RegisterForm />);
    await user.type(usernameInput(), "chese890");

    expect(await screen.findByText("Ese usuario ya está tomado.")).toBeInTheDocument();
    expect(usernameInput()).toHaveAttribute("aria-invalid", "true");
    expect(submit()).toBeDisabled();
  });

  it("si el RPC falla, deja seguir (el alta valida igual)", async () => {
    m.rpc.mockResolvedValue({ data: null, error: { message: "boom" } });
    const user = userEvent.setup();
    render(<RegisterForm />);
    await user.type(usernameInput(), "rosario");
    await vi.waitFor(() => expect(screen.queryByText("Chequeando…")).not.toBeInTheDocument());
    expect(screen.queryByText("Ese usuario ya está tomado.")).not.toBeInTheDocument();
    expect(submit()).toBeEnabled();
  });

  it("alta ok: 'Creando…' deshabilitado mientras envía y después va al creador de avatar", async () => {
    let resolve: (v: SignUpResult) => void = () => undefined;
    m.signUp.mockReturnValue(new Promise((r) => (resolve = r)));
    const user = userEvent.setup();
    render(<RegisterForm />);
    await user.type(usernameInput(), "rosario");
    await screen.findByText("Disponible ✓");
    await pickFavorites(user);
    await user.type(passwordInput(), "secreta1");
    await user.click(submit());

    const busy = await screen.findByRole("button", { name: "Creando…" });
    expect(busy).toBeDisabled();
    expect(m.signUp.mock.calls[0]?.[0].email).toMatch(/^rosario@/);
    expect(m.signUp.mock.calls[0]?.[0].options?.data).toEqual({ username: "rosario", fav_club: "BOC", fav_nation: "ARG" });

    resolve({ data: { user: { identities: [{}] } }, error: null });
    await vi.waitFor(() => expect(m.push).toHaveBeenCalledWith("/avatar?from=signup"));
  });

  it("identities vacío (duplicado ofuscado por Supabase): 'ya está tomado' y no navega", async () => {
    m.signUp.mockResolvedValue({ data: { user: { identities: [] } }, error: null });
    const user = userEvent.setup();
    render(<RegisterForm />);
    await user.type(usernameInput(), "rosario");
    await screen.findByText("Disponible ✓");
    await pickFavorites(user);
    await user.type(passwordInput(), "secreta1");
    await user.click(submit());

    expect(await screen.findByText("Ese usuario ya está tomado. Probá con otro.")).toBeInTheDocument();
    expect(m.push).not.toHaveBeenCalled();
  });

  it("error del alta: mensaje genérico", async () => {
    m.signUp.mockResolvedValue({ data: { user: null }, error: { message: "network" } });
    const user = userEvent.setup();
    render(<RegisterForm />);
    await user.type(usernameInput(), "rosario");
    await screen.findByText("Disponible ✓");
    await pickFavorites(user);
    await user.type(passwordInput(), "secreta1");
    await user.click(submit());

    expect(await screen.findByText(/No se pudo crear la cuenta/)).toBeInTheDocument();
    expect(m.push).not.toHaveBeenCalled();
  });

  it("sin club o país favorito: avisa, marca los selectores y no llama al alta", async () => {
    const user = userEvent.setup();
    render(<RegisterForm />);
    await user.type(usernameInput(), "rosario");
    await screen.findByText("Disponible ✓");
    await user.type(passwordInput(), "secreta1");
    await user.click(submit());

    expect(screen.getByText("Elegí tu club y tu país favoritos.")).toBeInTheDocument();
    expect(screen.getByTestId("fav-club")).toHaveAttribute("data-invalid", "true");
    expect(screen.getByTestId("fav-nation")).toHaveAccessibleDescription(/falta elegir/);
    expect(m.signUp).not.toHaveBeenCalled();
  });

  it("el selector muestra lo elegido (escudo + nombre)", async () => {
    const user = userEvent.setup();
    render(<RegisterForm />);
    await pickFavorites(user);
    expect(screen.getByTestId("fav-club")).toHaveTextContent("Boca Juniors");
    expect(screen.getByTestId("fav-nation")).toHaveTextContent("Argentina");
  });
});
