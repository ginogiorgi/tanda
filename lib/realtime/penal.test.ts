import { describe, it, expect } from "vitest";
import { clockOffset, isNewerPhase, remainingMs, resubscribeDelayMs } from "./penal";

describe("clockOffset", () => {
  it("es 0 cuando el reloj local coincide con el server", () => {
    const now = Date.parse("2026-06-16T12:00:00.000Z");
    expect(clockOffset("2026-06-16T12:00:00.000Z", now)).toBe(0);
  });

  it("es positivo cuando el server va adelante del reloj local", () => {
    const now = Date.parse("2026-06-16T12:00:00.000Z");
    // server_now 3s adelante → hay que sumarle 3s al reloj local.
    expect(clockOffset("2026-06-16T12:00:03.000Z", now)).toBe(3_000);
  });

  it("es negativo cuando el server va atrasado del reloj local", () => {
    const now = Date.parse("2026-06-16T12:00:05.000Z");
    expect(clockOffset("2026-06-16T12:00:00.000Z", now)).toBe(-5_000);
  });
});

describe("remainingMs", () => {
  const deadline = "2026-06-16T12:00:10.000Z";

  it("cuenta los ms hasta el deadline corrigiendo por offset", () => {
    const now = Date.parse("2026-06-16T12:00:00.000Z");
    expect(remainingMs(deadline, 0, now)).toBe(10_000);
  });

  it("aplica el offset: con el server 2s adelante, restan 2s menos", () => {
    const now = Date.parse("2026-06-16T12:00:00.000Z");
    // offset +2000 → el server ya está en 12:00:02 → faltan 8s.
    expect(remainingMs(deadline, 2_000, now)).toBe(8_000);
  });

  it("clampa a 0 cuando el deadline ya pasó", () => {
    const now = Date.parse("2026-06-16T12:00:15.000Z");
    expect(remainingMs(deadline, 0, now)).toBe(0);
  });

  it("clampa a 0 exacto en el deadline", () => {
    const now = Date.parse("2026-06-16T12:00:10.000Z");
    expect(remainingMs(deadline, 0, now)).toBe(0);
  });
});

describe("isNewerPhase", () => {
  const p = (penalty_id: string, idx: number, started_at: string) => ({ penalty_id, idx, started_at });
  it("sin fase actual, cualquiera es nueva", () => {
    expect(isNewerPhase(null, p("a", 1, "2026-11-22T12:00:00Z"))).toBe(true);
  });
  it("otro penal: solo si el idx es mayor (un poll viejo no vuelve atrás)", () => {
    const cur = p("b", 2, "2026-11-22T12:00:10Z");
    expect(isNewerPhase(cur, p("c", 3, "2026-11-22T12:00:20Z"))).toBe(true);
    expect(isNewerPhase(cur, p("a", 1, "2026-11-22T12:00:00Z"))).toBe(false);
  });
  it("mismo penal: la 2ª chance (arranca después) es nueva; la misma fase no", () => {
    const cur = p("b", 2, "2026-11-22T12:00:10Z");
    expect(isNewerPhase(cur, p("b", 2, "2026-11-22T12:00:20Z"))).toBe(true);
    expect(isNewerPhase(cur, p("b", 2, "2026-11-22T12:00:10.000Z"))).toBe(false);
  });
});

describe("resubscribeDelayMs", () => {
  it("duplica hasta 15 s", () => {
    expect([0, 1, 2, 3, 4, 5, 10].map(resubscribeDelayMs)).toEqual([1000, 2000, 4000, 8000, 15000, 15000, 15000]);
  });
});
