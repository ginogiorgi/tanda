import { describe, expect, it } from "vitest";
import { hashUserId, sentryEnabled, TUNNEL_PATH } from "./sentry";
import { isSentryWorthy } from "./client";

describe("sentry (cliente perezoso)", () => {
  it("fuera de Vercel no se prende (local, CI, e2e)", () => {
    expect(sentryEnabled()).toBe(false);
  });

  it("el id de usuario viaja como hash estable de 16 hex, nunca el uuid", async () => {
    const id = "0645dc96-e88c-49ff-ba9e-6db01b1d6196";
    const h = await hashUserId(id);
    expect(h).toMatch(/^[0-9a-f]{16}$/);
    expect(await hashUserId(id)).toBe(h);
    expect(h).not.toContain(id.slice(0, 8));
    expect(await hashUserId("otro")).not.toBe(h);
  });

  it("el túnel es del mismo origen (la CSP no cambia)", () => {
    expect(TUNNEL_PATH.startsWith("/")).toBe(true);
  });

  it("a Sentry van solo los errores de verdad", () => {
    expect(isSentryWorthy("rpc_error:select_option")).toBe(true);
    expect(isSentryWorthy("penal:stall_fatal")).toBe(true);
    expect(isSentryWorthy("realtime:channel_down")).toBe(false);
    expect(isSentryWorthy("penal:watchdog")).toBe(false);
  });
});
