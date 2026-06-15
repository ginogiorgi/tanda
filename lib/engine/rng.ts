/**
 * RNG determinista por seed (mulberry32). Toda la aleatoriedad del motor entra por acá, así
 * el juego es **reproducible y testeable** (mismo seed → mismo resultado). Ver SPEC §1.2.
 */

/** Crea un generador `() => [0,1)` determinista a partir de un seed entero. */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Entero en `[0, n)` a partir de un generador. */
export function randInt(rng: () => number, n: number): number {
  return Math.floor(rng() * n);
}

/** Booleano uniforme a partir de un generador. */
export function randBool(rng: () => number): boolean {
  return rng() < 0.5;
}
