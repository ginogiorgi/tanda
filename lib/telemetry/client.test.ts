import { afterEach, describe, expect, it } from "vitest";
import { KIND_GAP_MS, SESSION_CAP, logClientEvent, resetTelemetryForTests, setExternalReporter } from "./client";

afterEach(resetTelemetryForTests);

describe("logClientEvent (muestreo)", () => {
  it("el mismo kind sale una vez por ventana; otro kind sale", () => {
    const seen: string[] = [];
    setExternalReporter((k) => seen.push(k));
    expect(logClientEvent("a_b", {}, 0)).toBe(true);
    expect(logClientEvent("a_b", {}, KIND_GAP_MS - 1)).toBe(false);
    expect(logClientEvent("c_d", {}, 10)).toBe(true);
    expect(logClientEvent("a_b", {}, KIND_GAP_MS)).toBe(true);
    expect(seen).toEqual(["a_b", "c_d", "a_b"]);
  });

  it("tope por sesión y nunca tira aunque el reporter externo falle", () => {
    setExternalReporter(() => {
      throw new Error("sentry caído");
    });
    let ok = 0;
    for (let i = 0; i < SESSION_CAP + 5; i++) if (logClientEvent(`k_${i}`, {}, i)) ok++;
    expect(ok).toBe(SESSION_CAP);
  });
});
