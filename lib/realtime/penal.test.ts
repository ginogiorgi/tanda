import { describe, it, expect } from "vitest";
import { clockOffset, remainingMs } from "./penal";

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
