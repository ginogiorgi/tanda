/**
 * Cámara "dron" de la escena del penal (feedback 3 #1): detrás y arriba del pateador, inclinada ~50–55°
 * (no cenital), mirando al arco — como la foto aérea de referencia: arco arriba del cuadro, área grande,
 * área chica, medialuna y punto del penal. TS puro (tuplas) → testeable sin WebGL: `camera.test.ts`
 * proyecta el arco, los actores y la medialuna y exige que entren en el cuadro en celu y en PC.
 *
 *  - Idle: cuadro fijo.
 *  - Jugada: leve empuje hacia el arco hasta que llega la pelota (propia).
 *  - Reacción: deriva suave hacia donde quedó la acción (arquero o pelota).
 *  - En vertical (celu) el campo horizontal es angosto → más FOV; la acción queda en el tercio superior
 *    (la tarjeta de la pregunta tapa la parte de abajo).
 */
import type { ShotPlan, V3 } from "./shot";
import { BALL_T1 } from "./shot";

export interface CameraShot {
  pos: V3;
  look: V3;
  /** FOV vertical (grados). */
  fov: number;
}

const smooth = (t: number) => {
  const c = Math.max(0, Math.min(1, t));
  return c * c * (3 - 2 * c);
};
const mix = (a: V3, b: V3, w: number): V3 => [a[0] + (b[0] - a[0]) * w, a[1] + (b[1] - a[1]) * w, a[2] + (b[2] - a[2]) * w];

/** Vertical (celu) vs apaisado (PC/tablet). */
export const isPortrait = (aspect: number) => aspect < 0.85;

export function idleCamera(aspect: number): CameraShot {
  // Calibrado por búsqueda (camera.test.ts): inclinación ~49°, el arquero y el pateador lo más grandes posible
  // con el arco entero arriba y (en PC) la medialuna abajo.
  return isPortrait(aspect)
    ? { pos: [0, 9.5, 8], look: [0, 0, -0.5], fov: 50 }
    : { pos: [0, 10, 8.5], look: [0, 0, -0.25], fov: 50 };
}

/** Inicio de la deriva de reacción (s): la pelota ya quedó quieta. */
const REACT_T = 1.5;

/**
 * Cuadro en `t` (s desde que se resuelve el penal). `focusX` = x del mundo donde quedó la acción
 * (arquero en la atajada, pelota en el gol o afuera).
 */
export function droneCamera(aspect: number, plan: ShotPlan | null, t: number, focusX: number): CameraShot {
  const idle = idleCamera(aspect);
  if (!plan) return idle;
  // Empuje: 12% del camino hacia el punto mirado + un poco hacia el lado del remate.
  const push = smooth(t / BALL_T1);
  const lean = plan.target[0] * 0.18;
  const shotPos = mix(idle.pos, idle.look, 0.12);
  const shotLook: V3 = [lean, idle.look[1], idle.look[2] - 0.6];
  let pos = mix(idle.pos, [shotPos[0] + lean * 0.5, shotPos[1], shotPos[2]], push);
  let look = mix(idle.look, shotLook, push);
  const react = smooth((t - REACT_T) / 1.0);
  if (react > 0) {
    const fx = Math.max(-2.5, Math.min(2.5, focusX)) * 0.35;
    pos = mix(pos, [fx * 0.6, pos[1], pos[2]], react);
    look = mix(look, [fx, look[1], look[2]], react);
  }
  return { pos, look, fov: idle.fov };
}
