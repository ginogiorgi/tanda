import { describe, it, expect } from "vitest";
import { generateGuestUsername } from "./anon";
import { isValidUsername } from "@/lib/auth";

describe("generateGuestUsername", () => {
  it("siempre produce un username válido con prefijo invitado_", () => {
    for (let i = 0; i < 500; i++) {
      const u = generateGuestUsername();
      expect(u.startsWith("invitado_")).toBe(true);
      expect(isValidUsername(u)).toBe(true);
    }
  });
});
