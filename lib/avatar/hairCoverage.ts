/**
 * "¿El pelo tapa el cráneo?" (feedback 2, P7a.2) — sin WebGL. Para cada vértice del cuero cabelludo
 * (cabeza, por encima de las cejas) se tira un rayo hacia afuera por su normal: si no pega en el pelo
 * a menos de `maxGap`, ese vértice "asoma" (el pelo no lo cubre o el cráneo lo atraviesa). Todo en el
 * mismo espacio (mundo de reposo con el skinning aplicado).
 */
type V3 = readonly [number, number, number];

export interface HairTri {
  a: V3;
  b: V3;
  c: V3;
}

/** Möller–Trumbore, ambas caras; distancia o null. */
function rayHit(o: V3, d: V3, t: HairTri): number | null {
  const e1 = [t.b[0] - t.a[0], t.b[1] - t.a[1], t.b[2] - t.a[2]];
  const e2 = [t.c[0] - t.a[0], t.c[1] - t.a[1], t.c[2] - t.a[2]];
  const p = [d[1] * e2[2]! - d[2] * e2[1]!, d[2] * e2[0]! - d[0] * e2[2]!, d[0] * e2[1]! - d[1] * e2[0]!];
  const det = e1[0]! * p[0]! + e1[1]! * p[1]! + e1[2]! * p[2]!;
  if (Math.abs(det) < 1e-12) return null;
  const inv = 1 / det;
  const s = [o[0] - t.a[0], o[1] - t.a[1], o[2] - t.a[2]];
  const u = (s[0]! * p[0]! + s[1]! * p[1]! + s[2]! * p[2]!) * inv;
  if (u < 0 || u > 1) return null;
  const q = [s[1]! * e1[2]! - s[2]! * e1[1]!, s[2]! * e1[0]! - s[0]! * e1[2]!, s[0]! * e1[1]! - s[1]! * e1[0]!];
  const v = (d[0] * q[0]! + d[1] * q[1]! + d[2] * q[2]!) * inv;
  if (v < 0 || u + v > 1) return null;
  const dist = (e2[0]! * q[0]! + e2[1]! * q[1]! + e2[2]! * q[2]!) * inv;
  return dist >= 0 ? dist : null;
}

export interface ScalpPoint {
  p: V3;
  /** Normal unitaria hacia afuera. */
  n: V3;
}

/** Fracción de puntos del cuero cabelludo que el pelo NO cubre a menos de `maxGap` (m). */
export function uncoveredFraction(scalp: readonly ScalpPoint[], hair: readonly HairTri[], maxGap: number): number {
  if (scalp.length === 0) return 0;
  // Poda gruesa por caja: solo triángulos cerca del punto.
  let out = 0;
  for (const { p, n } of scalp) {
    let best = Infinity;
    for (const t of hair) {
      const minX = Math.min(t.a[0], t.b[0], t.c[0]) - maxGap;
      const maxX = Math.max(t.a[0], t.b[0], t.c[0]) + maxGap;
      if (p[0] < minX - maxGap || p[0] > maxX + maxGap) continue;
      const h = rayHit(p, n, t);
      if (h != null && h < best) best = h;
    }
    if (best > maxGap) out++;
  }
  return out / scalp.length;
}
