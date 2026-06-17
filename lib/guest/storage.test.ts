import { describe, it, expect } from "vitest";
import { isValidGuestName, normalizeGuestName } from "./storage";

describe("normalizeGuestName", () => {
  it("recorta y colapsa espacios", () => {
    expect(normalizeGuestName("  Lio   Messi ")).toBe("Lio Messi");
  });
});

describe("isValidGuestName", () => {
  it("acepta 2–20 chars tras normalizar", () => {
    expect(isValidGuestName("Di")).toBe(true);
    expect(isValidGuestName("Juan Roman Riquelme")).toBe(true); // 19
  });

  it("rechaza muy corto, vacío o muy largo", () => {
    expect(isValidGuestName(" a ")).toBe(false);
    expect(isValidGuestName("   ")).toBe(false);
    expect(isValidGuestName("x".repeat(21))).toBe(false);
  });
});
