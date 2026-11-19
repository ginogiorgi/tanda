import { describe, expect, it } from "vitest";
import { confettiPieces } from "./Confetti";

describe("confettiPieces (papelitos del campeón)", () => {
  const pieces = confettiPieces(90);

  it("es determinista (misma salida en SSR e hidratación)", () => {
    expect(confettiPieces(90)).toEqual(pieces);
  });

  it("quedan dentro de la pantalla y cerca de las bandas", () => {
    for (const p of pieces) {
      expect(p.x).toBeGreaterThanOrEqual(2);
      expect(p.x).toBeLessThanOrEqual(98);
      expect(p.y).toBeGreaterThanOrEqual(4);
      expect(p.y).toBeLessThanOrEqual(96);
    }
    const nearEdge = pieces.filter((p) => p.x < 25 || p.x > 75).length;
    expect(nearEdge / pieces.length).toBeGreaterThan(0.6);
  });

  it("cada uno se tira desde la tribuna de su lado (o desde arriba/abajo)", () => {
    for (const p of pieces) {
      if (p.edge === "left") expect(p.x).toBeLessThan(50);
      if (p.edge === "right") expect(p.x).toBeGreaterThanOrEqual(50);
    }
    expect(new Set(pieces.map((p) => p.edge)).size).toBe(4);
  });

  it("el vuelo termina en ≤ 3,5 s (después quedan quietos)", () => {
    for (const p of pieces) expect(p.delay + p.duration).toBeLessThanOrEqual(3.5);
  });
});
