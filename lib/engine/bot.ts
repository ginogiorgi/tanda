/**
 * Modelo de dificultad de bots por selección (§7.2 BRIEF) — **puro y determinista**.
 * Cada nación tiene un `difficulty_tier` según su ranking FIFA (ver seed `nations`, 5.0):
 *
 *   | tier   | banda ranking | % acierto | velocidad |
 *   |--------|---------------|-----------|-----------|
 *   | elite  | top 10        | 80%       | 2–5 s     |
 *   | high   | 11–20         | 70%       | 2–6 s     |
 *   | medium | 21–30         | 60%       | 2–7 s     |
 *   | low    | resto         | 50%       | 2–8 s     |
 *
 * Devuelve la "intención" de un bot para un penal: si va a acertar y a los cuántos ms responde.
 * La aleatoriedad entra por `seed` (reproducible/testeable). Se usa en el modo invitado
 * (client-side, §8.4) y se porta a plpgsql para materializar `bot_intents` en el camino
 * multijugador (5.3), igual que `resolvePenalty` (decisión SPEC §1.2).
 */

import { makeRng } from "./rng";

/** Tier de dificultad (enum `difficulty_tier` de la DB, SPEC §2.1). */
export type DifficultyTier = "elite" | "high" | "medium" | "low";

/** Parámetros del modelo por tier (§7.2). `minDelayMs` es 2s para todos. */
export const TIER_MODEL: Record<
  DifficultyTier,
  { accuracy: number; minDelayMs: number; maxDelayMs: number }
> = {
  elite: { accuracy: 0.8, minDelayMs: 2000, maxDelayMs: 5000 },
  high: { accuracy: 0.7, minDelayMs: 2000, maxDelayMs: 6000 },
  medium: { accuracy: 0.6, minDelayMs: 2000, maxDelayMs: 7000 },
  low: { accuracy: 0.5, minDelayMs: 2000, maxDelayMs: 8000 },
};

/** Intención de un bot para una fase del penal. */
export interface BotIntent {
  /** ¿Va a contestar la correcta? */
  willBeCorrect: boolean;
  /** A los cuántos ms desde que abre el penal responde (dentro de la ventana). */
  delayMs: number;
}

/**
 * "Constante de oro" para derivar un segundo seed independiente del mismo origen, sin tener
 * que encadenar el generador (así el port a SQL es un `engine_mulberry32(seed ^ const)`).
 */
const DELAY_SEED_SALT = 0x9e3779b9;

/**
 * Decide la intención del bot para un penal. Determinista: mismo `(tier, seed)` → mismo
 * resultado. `willBeCorrect` y `delayMs` salen de **seeds derivados** (no de llamadas
 * encadenadas al RNG) para que el port a plpgsql sea directo.
 */
export function botIntent(tier: DifficultyTier, seed: number): BotIntent {
  const { accuracy, minDelayMs, maxDelayMs } = TIER_MODEL[tier];
  const willBeCorrect = makeRng(seed)() < accuracy;
  const delayRoll = makeRng((seed ^ DELAY_SEED_SALT) >>> 0)();
  const delayMs = minDelayMs + Math.floor(delayRoll * (maxDelayMs - minDelayMs + 1));
  return { willBeCorrect, delayMs };
}
