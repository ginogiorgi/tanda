import { describe, expect, it, vi } from "vitest";
import { IAT_RETRY_DELAY_MS, withIatRetry } from "./iatRetry";

const iatFuture = () =>
  new Response(JSON.stringify({ code: "PGRST303", details: null, hint: null, message: "JWT issued at future" }), {
    status: 401,
    headers: { "content-type": "application/json" },
  });
const ok = () => new Response(JSON.stringify([{ username: "invitado_123456789" }]), { status: 200 });

describe("withIatRetry (bug 'Entrando…' del invitado)", () => {
  it("reintenta una vez tras el 401 PGRST303 y devuelve la respuesta buena", async () => {
    const base = vi.fn<typeof fetch>().mockResolvedValueOnce(iatFuture()).mockResolvedValueOnce(ok());
    const wait = vi.fn(async () => {});
    const res = await withIatRetry(base, wait)("http://x/rest/v1/profiles", { method: "GET" });
    expect(res.status).toBe(200);
    expect(base).toHaveBeenCalledTimes(2);
    expect(base.mock.calls[1]).toEqual(["http://x/rest/v1/profiles", { method: "GET" }]);
    expect(wait).toHaveBeenCalledWith(IAT_RETRY_DELAY_MS);
  });

  it("si el reintento vuelve a fallar, devuelve ese error (sin loop)", async () => {
    const base = vi.fn<typeof fetch>().mockResolvedValueOnce(iatFuture()).mockResolvedValueOnce(iatFuture());
    const res = await withIatRetry(base, async () => {})("http://x");
    expect(res.status).toBe(401);
    expect(base).toHaveBeenCalledTimes(2);
  });

  it("no toca otros 401 (JWT vencido, firma inválida) ni respuestas OK", async () => {
    for (const r of [
      new Response(JSON.stringify({ code: "PGRST303", message: "JWT expired" }), { status: 401 }),
      new Response(JSON.stringify({ code: "PGRST301", message: "JWSError JWSInvalidSignature" }), { status: 401 }),
      new Response("not json", { status: 401 }),
      ok(),
    ]) {
      const base = vi.fn<typeof fetch>().mockResolvedValueOnce(r);
      const wait = vi.fn(async () => {});
      const res = await withIatRetry(base, wait)("http://x");
      expect(res).toBe(r);
      expect(base).toHaveBeenCalledTimes(1);
      expect(wait).not.toHaveBeenCalled();
    }
  });

  it("el body de la respuesta devuelta sigue legible (se leyó un clone)", async () => {
    const base = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response(JSON.stringify({ code: "PGRST303", message: "JWT expired" }), { status: 401 }),
    );
    const res = await withIatRetry(base, async () => {})("http://x");
    await expect(res.json()).resolves.toMatchObject({ message: "JWT expired" });
  });
});
