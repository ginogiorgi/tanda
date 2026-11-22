import { describe, expect, it } from "vitest";
import {
  autoFingerprint,
  buildAutoReportEmail,
  buildOpsEmail,
  firstFrame,
  normalizeMessage,
  normalizeRoute,
  opsKey,
  parseAutoReport,
} from "./auto";

const STACK_A = `TypeError: Cannot read properties of undefined (reading 'idx')
    at PenalView (https://tanda2026.com.ar/_next/static/chunks/app-3f2a9c1d7e.js:12:3456)
    at renderWithHooks (https://tanda2026.com.ar/_next/static/chunks/react-aa11bb22cc.js:1:2)`;
const STACK_B = STACK_A.replace("3f2a9c1d7e", "9999aaaa00").replace(":12:3456", ":13:99");

describe("parseAutoReport", () => {
  it("acepta lo mínimo y recorta", () => {
    const r = parseAutoReport({ kind: "auto", message: "x".repeat(500), stack: "s", route: "/partido", source: "game" });
    expect(r).toMatchObject({ route: "/partido", source: "game", stack: "s", digest: null });
    expect(r!.message).toHaveLength(300);
  });
  it("rechaza sin mensaje ni digest, otro kind o rutas raras", () => {
    expect(parseAutoReport({ kind: "auto" })).toBeNull();
    expect(parseAutoReport({ kind: "bug", message: "hola" })).toBeNull();
    expect(parseAutoReport({ kind: "auto", message: "m", route: "javascript:alert(1)" })!.route).toBeNull();
    expect(parseAutoReport({ kind: "auto", digest: "12345" })!.message).toBe("(sin mensaje)");
    expect(parseAutoReport({ kind: "auto", message: "m", digest: "<script>" })!.digest).toBeNull();
  });
});

describe("fingerprint", () => {
  it("el mismo bug en otra partida/deploy da el mismo hash", () => {
    const a = autoFingerprint({ message: "Penal 3f2a9c1d-0000-4000-8000-000000000001 no existe (idx 7)", route: "/sala/AB12C", stack: STACK_A, digest: null });
    const b = autoFingerprint({ message: "Penal 9f2a9c1d-0000-4000-8000-000000000002 no existe (idx 3)", route: "/sala/ZZ99Q?x=1", stack: STACK_B, digest: null });
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{32}$/);
  });
  it("otro mensaje, otra pantalla u otro frame → otro hash", () => {
    const base = { message: "boom", route: "/partido", stack: STACK_A, digest: null };
    const fpBase = autoFingerprint(base);
    expect(autoFingerprint({ ...base, message: "bang" })).not.toBe(fpBase);
    expect(autoFingerprint({ ...base, route: "/perfil" })).not.toBe(fpBase);
    expect(autoFingerprint({ ...base, stack: STACK_A.replace("PenalView", "Bracket") })).not.toBe(fpBase);
  });
  it("sin stack, el digest distingue errores de server", () => {
    const a = autoFingerprint({ message: "x", route: "/", stack: null, digest: "111" });
    expect(autoFingerprint({ message: "x", route: "/", stack: null, digest: "222" })).not.toBe(a);
  });
  it("normalizadores", () => {
    expect(normalizeRoute("/sala/AB12C?x=1")).toBe("/sala/:id");
    expect(normalizeRoute("/perfil")).toBe("/perfil");
    expect(normalizeRoute(null)).toBe("-");
    expect(normalizeMessage("a 12  b deadbeefdeadbeef")).toBe("a # b #");
    expect(firstFrame(STACK_A)).toBe("at PenalView (https://tanda2026.com.ar/_next/static/chunks/app.js");
    expect(firstFrame(null)).toBe("-");
  });
});

describe("mails", () => {
  it("auto: asunto con el prefijo fijo y todo escapado", () => {
    const m = buildAutoReportEmail(
      { message: "<b>boom</b>", stack: STACK_A, digest: null, route: "/partido", source: "game" },
      {
        reportId: "r1",
        userId: null,
        username: null,
        isGuest: false,
        createdAt: new Date("2026-11-22T12:00:00Z"),
        userAgent: null,
        version: null,
        activeTournament: null,
        occurrences: 3,
        fingerprint: "f".repeat(32),
      },
    );
    expect(m.subject).toBe("[Tanda] Bug: (auto) <b>boom</b>");
    expect(m.html).not.toContain("<b>boom");
    expect(m.html).toContain("Juego trabado");
  });
  it("ops: clave por tipo+torneo+paso y asunto con prefijo", () => {
    const e = { id: 1, created_at: "2026-11-22T12:00:00Z", kind: "tick_error", tournament_id: null, detail: { step: "bot_intents" } };
    expect(opsKey(e)).toBe("tick_error|-|bot_intents");
    expect(opsKey({ ...e, detail: null })).toBe("tick_error|-|-");
    expect(buildOpsEmail([e], null).subject).toBe("[Tanda] Bug: (server) error en un barrido de tick()");
  });
});
