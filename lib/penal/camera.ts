/**
 * Cámara "dron" de la escena del penal (feedback 3 #1): detrás y arriba del pateador, inclinada ~50–55°
 * (no cenital), mirando al arco — como la foto aérea de referencia: arco arriba del cuadro, área grande,
 * área chica, medialuna y punto del penal. TS puro (tuplas) → testeable sin WebGL: `camera.test.ts`
 * proyecta el arco, los actores y la medialuna y exige que entren en el cuadro en celu y en PC.
 *
 *  - Idle: cuadro fijo.
 *  - Jugada: leve empuje hacia el arco hasta que llega la pelota (propia).
 *  - Reacción: deriva suave hacia donde quedó la acción (arquero o pelota).
 *  - Gol (feedback 4 #16): después de la red, la cámara baja y se acerca al pateador para que el festejo se lea
 *    (de lejos medía ~30 px). Lo sigue si se mueve (rodillazo, carrerita) y en celu lo deja en la mitad de
 *    abajo (arriba va el cartel del resultado).
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

/** Arranque y duración del acercamiento al festejo (s): la pelota ya está en la red. */
export const CELEBRATION_CAM_T = 1.7;
const CELEBRATION_CAM_S = 0.9;

/** Primer plano del festejo: algo arriba y adelante del pateador (`at` = sus pies en el mundo). */
export function celebrationCamera(aspect: number, at: V3): CameraShot {
  const [x, , z] = at;
  return isPortrait(aspect)
    ? { pos: [x, 4.6, z + 5.4], look: [x, 1.9, z - 0.9], fov: 40 }
    : { pos: [x, 3.6, z + 5.2], look: [x, 0.95, z - 0.2], fov: 38 };
}

/**
 * Cuadro en `t` (s desde que se resuelve el penal). `focusX` = x del mundo donde quedó la acción
 * (arquero en la atajada, pelota en el gol o afuera). `kicker` = pies del pateador en el mundo (para el
 * primer plano del festejo en el gol).
 */
export function droneCamera(aspect: number, plan: ShotPlan | null, t: number, focusX: number, kicker?: V3): CameraShot {
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
  const close = plan.reason === "goal" && kicker ? smooth((t - CELEBRATION_CAM_T) / CELEBRATION_CAM_S) : 0;
  if (close > 0 && kicker) {
    const c = celebrationCamera(aspect, kicker);
    return { pos: mix(pos, c.pos, close), look: mix(look, c.look, close), fov: idle.fov + (c.fov - idle.fov) * close };
  }
  return { pos, look, fov: idle.fov };
}
