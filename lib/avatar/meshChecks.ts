/**
 * Chequeos geométricos de mallas (feedback 2, P7a.2) — puros, sin WebGL. Los usa
 * `components/avatar/assets.test.ts` sobre los GLB reales y las mallas generadas (botines, cresta).
 *
 * Las posiciones se sueldan por cercanía (`eps`) antes de contar aristas: el GLB y los loft pueden
 * duplicar vértices por normales/UV sin que la superficie esté abierta.
 */
export interface Tri {
  a: [number, number, number];
  b: [number, number, number];
  c: [number, number, number];
}

type V3 = [number, number, number];

/** Triángulos (en el espacio que venga) desde posiciones + índices opcionales. */
export function triangles(pos: ArrayLike<number>, index?: ArrayLike<number> | null): Tri[] {
  const v = (i: number): V3 => [pos[i * 3]!, pos[i * 3 + 1]!, pos[i * 3 + 2]!];
  const n = index ? index.length : pos.length / 3;
  const out: Tri[] = [];
  for (let t = 0; t + 2 < n; t += 3) {
    const [i, j, k] = index ? [index[t]!, index[t + 1]!, index[t + 2]!] : [t, t + 1, t + 2];
    out.push({ a: v(i), b: v(j), c: v(k) });
  }
  return out;
}

const key = (p: V3, eps: number) => p.map((x) => Math.round(x / eps)).join(",");

/** Aristas usadas por un solo triángulo (0 = malla cerrada). */
export function boundaryEdges(tris: readonly Tri[], eps = 1e-5): number {
  const count = new Map<string, number>();
  for (const t of tris) {
    const ks = [key(t.a, eps), key(t.b, eps), key(t.c, eps)];
    if (ks[0] === ks[1] || ks[1] === ks[2] || ks[0] === ks[2]) continue; // degenerado
    for (let e = 0; e < 3; e++) {
      const u = ks[e]!;
      const w = ks[(e + 1) % 3]!;
      const k = u < w ? `${u}|${w}` : `${w}|${u}`;
      count.set(k, (count.get(k) ?? 0) + 1);
    }
  }
  let open = 0;
  for (const c of count.values()) if (c === 1) open++;
  return open;
}

/** Volumen con signo (teorema de la divergencia): > 0 si las normales apuntan hacia afuera. */
export function signedVolume(tris: readonly Tri[]): number {
  let v = 0;
  for (const { a, b, c } of tris) {
    v += (a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6;
  }
  return v;
}

/**
 * Fracción de triángulos cuya normal geométrica (winding) apunta HACIA el centroide de la malla —
 * para mallas convexas-ish (botín, cráneo) es la fracción "dada vuelta".
 */
export function inwardFraction(tris: readonly Tri[]): number {
  if (tris.length === 0) return 0;
  const c: V3 = [0, 0, 0];
  for (const t of tris) for (const p of [t.a, t.b, t.c]) for (let i = 0; i < 3; i++) c[i]! += p[i]! / (tris.length * 3);
  let inward = 0;
  for (const { a, b, c: cc } of tris) {
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const w = [cc[0] - a[0], cc[1] - a[1], cc[2] - a[2]];
    const n = [u[1]! * w[2]! - u[2]! * w[1]!, u[2]! * w[0]! - u[0]! * w[2]!, u[0]! * w[1]! - u[1]! * w[0]!];
    const m = [(a[0] + b[0] + cc[0]) / 3 - c[0], (a[1] + b[1] + cc[1]) / 3 - c[1], (a[2] + b[2] + cc[2]) / 3 - c[2]];
    if (n[0]! * m[0]! + n[1]! * m[1]! + n[2]! * m[2]! < 0) inward++;
  }
  return inward / tris.length;
}
