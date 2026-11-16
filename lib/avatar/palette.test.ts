import { describe, expect, it } from "vitest";
import { BOOTS_PALETTE, deltaE, HAIR_PALETTE, hexToLab, KIT_PALETTE, nearestSwatch, SKIN_PALETTE } from "./palette";

describe("paletas del avatar", () => {
  it("hex válidos, ids y colores únicos por paleta, tamaños del plan", () => {
    for (const [p, n] of [
      [HAIR_PALETTE, 8],
      [SKIN_PALETTE, 6],
      [KIT_PALETTE, 10],
      [BOOTS_PALETTE, 6],
    ] as const) {
      expect(p).toHaveLength(n);
      expect(new Set(p.map((s) => s.id)).size).toBe(n);
      expect(new Set(p.map((s) => s.hex.toLowerCase())).size).toBe(n);
      for (const s of p) expect(s.hex).toMatch(/^#[0-9A-F]{6}$/i);
    }
  });

  it("los colores de una paleta se distinguen entre sí (ΔE ≥ 10)", () => {
    for (const p of [HAIR_PALETTE, SKIN_PALETTE, KIT_PALETTE, BOOTS_PALETTE]) {
      for (const a of p) for (const b of p) if (a !== b) expect(deltaE(a.hex, b.hex), `${a.id}/${b.id}`).toBeGreaterThanOrEqual(10);
    }
  });

  it("nada chillón en la ropa: croma CIELAB ≤ 60", () => {
    for (const s of [...KIT_PALETTE, ...BOOTS_PALETTE]) {
      const [, a, b] = hexToLab(s.hex);
      expect(Math.hypot(a, b), s.id).toBeLessThanOrEqual(60);
    }
  });

  it("Lab de referencia y el más cercano", () => {
    expect(hexToLab("#FFFFFF")[0]).toBeCloseTo(100, 0);
    expect(hexToLab("#000000")[0]).toBeCloseTo(0, 5);
    expect(nearestSwatch(KIT_PALETTE, "#e63946").id).toBe("brick");
    expect(nearestSwatch(HAIR_PALETTE, "#1d1d1d").id).toBe("black");
  });
});
