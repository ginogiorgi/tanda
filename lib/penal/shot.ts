/**
 * Plan del remate de la escena 3D (Fase 6). TS puro y determinista por `reason` + `variant`: misma
 * entrada → misma jugada en todos los clientes. La escena muestrea `ballAt(plan, t)` por frame.
 *
 * Línea de tiempo (s desde que se resuelve el penal):
 *   0 → BALL_T0  carrera + patada (contacto en BALL_T0)
 *   BALL_T0 → BALL_T1  vuelo de la pelota hasta el arco / las manos / afuera
 *   BALL_T1 → BALL_T2  después: cae en la red, rebota en el arquero o sigue de largo
 * El arquero arranca la estirada en `DIVE_T0`.
 */
import { DIVE_HIGH_Y, DIVE_LOW_Y, type DiveReach } from "@/lib/avatar/rig";
import type { PenaltyReason } from "@/lib/realtime/penal";

export const GOAL_Z = -7;
export const GOAL_HALF_W = 1.8;
export const GOAL_H = 2.0;
export const BALL_R = 0.12;
export const SPOT: V3 = [0, BALL_R, 0];

export const BALL_T0 = 0.3;
export const BALL_T1 = 1.0;
export const BALL_T2 = 1.6;
export const DIVE_T0 = 0.25;
/** En el gol el arquero sale a destiempo (feedback 3 #5): misma estirada, tarde y al otro lado. */
export const DIVE_LATE = 0.12;
/** Línea del arquero: medio metro adelante de la línea de gol. */
export const KEEPER_Z = GOAL_Z + 0.3;

export type V3 = readonly [number, number, number];

export interface ShotPlan {
  reason: PenaltyReason;
  /** Donde llega la pelota en BALL_T1. */
  target: V3;
  /** Donde queda en BALL_T2 (red, rebote o afuera). */
  settle: V3;
  /** Lado de la estirada del arquero en X del mundo (+1 / -1). */
  keeperDir: 1 | -1;
  /** Altura del arco de la trayectoria. */
  lift: number;
  /** Arranque de la estirada (s). En la atajada la mano llega a la pelota justo en `BALL_T1`. */
  diveT0: number;
  /** A dónde estira la mano el arquero, en su marco (x lateral > 0 hacia `keeperDir`). */
  reach: DiveReach;
}

const clampY = (y: number) => Math.max(DIVE_LOW_Y, Math.min(DIVE_HIGH_Y, y));

export function shotPlan(reason: PenaltyReason, variant: number): ShotPlan {
  const side: 1 | -1 = variant % 2 === 0 ? -1 : 1;
  const high = variant >= 2;
  const y = high ? GOAL_H * 0.7 : 0.45;
  // Sin pelota que tocar (gol/afuera), el arquero estira al lado elegido, a la altura del remate.
  const blind: DiveReach = { x: 1.5, y: clampY(y), z: 0.2 };
  switch (reason) {
    case "goal": {
      // Entra al ángulo; el arquero vuela al lado equivocado. Después cae dentro de la red.
      const x = side * GOAL_HALF_W * 0.74;
      return {
        reason,
        target: [x, y, GOAL_Z - 0.55],
        settle: [x * 1.04, BALL_R, GOAL_Z - 0.8],
        keeperDir: side === 1 ? -1 : 1,
        lift: high ? 0.5 : 0.25,
        diveT0: DIVE_T0 + DIVE_LATE,
        reach: blind,
      };
    }
    case "save": {
      // El arquero llega con la mano y la rechaza hacia el costado.
      const target: V3 = [side * 1.5, high ? DIVE_HIGH_Y : DIVE_LOW_Y, GOAL_Z + 0.55];
      return {
        reason,
        target,
        settle: [side * 2.9, BALL_R, GOAL_Z + 2.4],
        keeperDir: side,
        lift: high ? 0.35 : 0.2,
        diveT0: DIVE_T0,
        reach: { x: Math.abs(target[0]), y: target[1], z: target[2] - KEEPER_Z },
      };
    }
    case "miss_wide":
    default: {
      // Afuera: por fuera del palo o por arriba del travesaño; sigue hasta los carteles.
      const tx = high ? side * GOAL_HALF_W * 0.6 : side * (GOAL_HALF_W + 0.75);
      const ty = high ? GOAL_H + 0.65 : 0.5;
      return {
        reason: "miss_wide",
        target: [tx, ty, GOAL_Z + 0.05],
        settle: [tx * 1.25, high ? GOAL_H + 0.9 : BALL_R, GOAL_Z - 2.4],
        keeperDir: side,
        lift: high ? 0.6 : 0.3,
        diveT0: DIVE_T0,
        reach: blind,
      };
    }
  }
}

const clamp01 = (t: number) => Math.max(0, Math.min(1, t));
const lerp = (a: number, b: number, t: number) => a * (1 - t) + b * t;
const easeOut = (t: number) => 1 - (1 - t) * (1 - t);

/** Posición de la pelota en `t` (s). Continua en BALL_T0 y BALL_T1. */
export function ballAt(plan: ShotPlan, t: number): [number, number, number] {
  if (t <= BALL_T0) return [SPOT[0], SPOT[1], SPOT[2]];
  if (t <= BALL_T1) {
    const p = clamp01((t - BALL_T0) / (BALL_T1 - BALL_T0));
    const e = easeOut(p);
    const arc = Math.sin(Math.PI * p) * plan.lift;
    return [lerp(SPOT[0], plan.target[0], e), lerp(SPOT[1], plan.target[1], e) + arc, lerp(SPOT[2], plan.target[2], e)];
  }
  const p = clamp01((t - BALL_T1) / (BALL_T2 - BALL_T1));
  // Horizontal frena (easeOut); vertical cae con "gravedad" (p²). En el rechazo, un piquecito.
  const h = easeOut(p);
  const bounce = plan.reason === "save" ? Math.sin(Math.PI * p) * 0.35 : 0;
  return [
    lerp(plan.target[0], plan.settle[0], h),
    lerp(plan.target[1], plan.settle[1], p * p) + bounce,
    lerp(plan.target[2], plan.settle[2], h),
  ];
}

/** Comba de la red (0..1): pico apenas entra la pelota y se apaga en ~0.5 s. Solo en el gol. */
export function netBulge(plan: ShotPlan, t: number): number {
  if (plan.reason !== "goal" || t < BALL_T1 - 0.05) return 0;
  const p = (t - (BALL_T1 - 0.05)) / 0.5;
  return p >= 1 ? 0 : Math.sin(Math.PI * p) * (1 - p * 0.5);
}
