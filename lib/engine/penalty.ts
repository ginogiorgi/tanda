/**
 * Resolución de un penal — función **pura y determinista** (tabla §5.2 del BRIEF). Sin I/O
 * ni red: el timing y la corrección ya vienen calculados por el servidor (`now()`), acá solo
 * se aplica la regla. La aleatoriedad (desempate por mismo tiempo, opción que se quita en la
 * segunda chance) entra por `seed`. Ver SPEC §3.1 / §8.1.
 *
 * Perspectiva: el resultado es del **pateador**. `scored = true` → GOL; `false` → ATAJADO.
 * `reason` mapea a la familia de animación (§8.1):
 *   - `goal`      → el pateador convierte.
 *   - `save`      → atajada: el arquero gana el duelo (ambos aciertan, arquero más rápido).
 *   - `miss_wide` → el pateador erró la pregunta (o falló la segunda chance): la tiró afuera.
 */

import { makeRng, randInt } from "./rng";

/** Lado del penal. */
export type Side = "kicker" | "keeper";

/** Familia de animación del resultado. */
export type PenaltyReason = "goal" | "save" | "miss_wide";

/**
 * Estado de la respuesta de un jugador al momento de resolver. El servidor ya asignó una
 * opción aleatoria a los **ausentes** (desconectados) antes de llamar acá; un humano
 * **presente** que no eligió queda `answered: false` (timeout = fallo, "la tiró afuera").
 */
export interface PlayerAnswer {
  /** ¿Hizo una selección? (los ausentes llegan con una opción ya asignada → true). */
  answered: boolean;
  /** Índice de opción elegido (`null` si no respondió). */
  optionIndex: number | null;
  /** Timestamp server de la última selección (ms). Menor = más rápido. `null` si no respondió. */
  selectedAt: number | null;
}

/** Contexto de la resolución (mismo para ambos jugadores). */
export interface PenaltyContext {
  /** Índice de la opción correcta (server-only). */
  correctIndex: number;
  /** Seed para desempates/quita de opción (reproducible). */
  seed: number;
  /** Fase del penal: en `first`, "los dos mal" abre segunda chance; en `second_chance`, no. */
  phase: "first" | "second_chance";
}

/** Penal resuelto. */
export interface ResolvedPenalty {
  outcome: "resolved";
  /** Quién ganó el duelo. */
  winner: Side;
  /** `true` = GOL (convirtió el pateador); `false` = ATAJADO. */
  scored: boolean;
  reason: PenaltyReason;
  /** Variante de animación (seeded), para que no patee siempre igual. */
  variant: number;
}

/** "Los dos mal" en primera fase → segunda chance con una opción menos. */
export interface SecondChancePenalty {
  outcome: "second_chance";
  /** Opción (incorrecta) que se quita; quedan 2 (la correcta + una incorrecta). */
  removedOption: number;
}

export type PenaltyResolution = ResolvedPenalty | SecondChancePenalty;

/** Cantidad de variantes de animación por familia. */
const VARIANT_COUNT = 4;

function isCorrect(answer: PlayerAnswer, correctIndex: number): boolean {
  return answer.answered && answer.optionIndex === correctIndex;
}

/** Decide el ganador cuando NO es "los dos mal". `null` = los dos mal. */
function decideWinner(
  kicker: PlayerAnswer,
  keeper: PlayerAnswer,
  ctx: PenaltyContext,
): { winner: Side; reason: PenaltyReason } | null {
  const kOk = isCorrect(kicker, ctx.correctIndex);
  const gOk = isCorrect(keeper, ctx.correctIndex);

  if (kOk && gOk) {
    // Ambos bien → gana el más rápido; mismo tiempo → aleatorio por seed.
    const kt = kicker.selectedAt ?? Number.POSITIVE_INFINITY;
    const gt = keeper.selectedAt ?? Number.POSITIVE_INFINITY;
    if (kt < gt) return { winner: "kicker", reason: "goal" };
    if (gt < kt) return { winner: "keeper", reason: "save" };
    const kickerWins = makeRng(ctx.seed)() < 0.5;
    return kickerWins
      ? { winner: "kicker", reason: "goal" }
      : { winner: "keeper", reason: "save" };
  }
  if (kOk) return { winner: "kicker", reason: "goal" };
  if (gOk) return { winner: "keeper", reason: "miss_wide" }; // pateador erró → afuera
  return null; // los dos mal
}

/** Opción incorrecta a quitar en la segunda chance (la que ambos erraron, o una por seed). */
function pickRemovedOption(
  kicker: PlayerAnswer,
  keeper: PlayerAnswer,
  ctx: PenaltyContext,
): number {
  const wrong = [0, 1, 2].filter((i) => i !== ctx.correctIndex);
  const kw =
    kicker.answered && kicker.optionIndex !== ctx.correctIndex
      ? kicker.optionIndex
      : null;
  const gw =
    keeper.answered && keeper.optionIndex !== ctx.correctIndex
      ? keeper.optionIndex
      : null;
  // Si ambos erraron la MISMA opción, esa desaparece (regla literal del BRIEF §5.2).
  if (kw !== null && kw === gw) return kw;
  // Si no (errores distintos / timeouts), quitamos una incorrecta determinística por seed.
  const removed = wrong[randInt(makeRng(ctx.seed), wrong.length)];
  if (removed === undefined) throw new Error("correctIndex fuera de rango (0-2)");
  return removed;
}

/**
 * Resuelve una fase del penal. En `first`, "los dos mal" devuelve `second_chance`; en
 * `second_chance` no hay tercera chance: si vuelven a errar los dos (o el pateador no
 * responde) gana el arquero (ATAJADO, `miss_wide`).
 */
export function resolvePenalty(
  kicker: PlayerAnswer,
  keeper: PlayerAnswer,
  ctx: PenaltyContext,
): PenaltyResolution {
  const decided = decideWinner(kicker, keeper, ctx);

  if (decided === null) {
    // Los dos mal.
    if (ctx.phase === "first") {
      return {
        outcome: "second_chance",
        removedOption: pickRemovedOption(kicker, keeper, ctx),
      };
    }
    // Segunda chance fallida → gana el arquero, la tiró afuera.
    return {
      outcome: "resolved",
      winner: "keeper",
      scored: false,
      reason: "miss_wide",
      variant: randInt(makeRng(ctx.seed ^ 0x5f356495), VARIANT_COUNT),
    };
  }

  return {
    outcome: "resolved",
    winner: decided.winner,
    scored: decided.winner === "kicker",
    reason: decided.reason,
    variant: randInt(makeRng(ctx.seed ^ 0x5f356495), VARIANT_COUNT),
  };
}
