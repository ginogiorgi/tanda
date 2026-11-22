/**
 * Festejos de gol (feedback 4 #16): cinco celebraciones famosas, como clips del rig propio. Referencia y
 * criterios en `docs/celebrations.md`. Todas arrancan de espaldas a la cámara (el pateador mira al arco) y
 * giran hacia ella; la última pose es la "foto" del festejo (reduced motion la muestra directo).
 *
 * Convenciones del rig (`rig.ts`): +X = izquierda del personaje, mira a +Z (al arco). `root.ry = π` = mirando
 * a la cámara. `root.z` negativo = se acerca a la cámara (el grupo del pateador está girado π).
 *
 * El elegido sale del id del penal → todos los clientes ven el mismo festejo (determinista, sin red).
 */
import type { Clip, Euler3, Joint, PoseSpec } from "./rig";

export const CELEBRATION_IDS = ["siu", "sky", "crossed", "cradle", "slide"] as const;
export type CelebrationId = (typeof CELEBRATION_IDS)[number];

export const CELEBRATION_NAMES: Record<CelebrationId, string> = {
  siu: "Siuuu",
  sky: "Dedicatoria al cielo",
  crossed: "Brazos cruzados",
  cradle: "La cuna",
  slide: "Rodillazo",
};

const PI = Math.PI;
type Joints = Partial<Record<Joint, Euler3>>;

const RELAXED: Joints = {
  shoulderL: [0, 0, 0.12],
  shoulderR: [0, 0, -0.12],
  elbowL: [-0.15, 0, 0],
  elbowR: [-0.15, 0, 0],
};

/** Trote corto girando hacia la cámara (lo comparten varios): paso con la izquierda / con la derecha. */
const jogStep = (ry: number, z: number, lead: "L" | "R", arms: Joints = {}): PoseSpec => ({
  root: { ry, z, y: 0.03 },
  joints: {
    spine: [0.12, 0, 0],
    hipL: lead === "L" ? [-0.55, 0, 0] : [0.3, 0, 0],
    kneeL: lead === "L" ? [0.35, 0, 0] : [0.9, 0, 0],
    hipR: lead === "R" ? [-0.55, 0, 0] : [0.3, 0, 0],
    kneeR: lead === "R" ? [0.35, 0, 0] : [0.9, 0, 0],
    shoulderL: lead === "L" ? [0.45, 0, 0.2] : [-0.45, 0, 0.2],
    shoulderR: lead === "L" ? [-0.45, 0, -0.2] : [0.45, 0, -0.2],
    elbowL: [-1.1, 0, 0],
    elbowR: [-1.1, 0, 0],
    ...arms,
  },
});

// ── 1. Siuuu (Cristiano Ronaldo) ──
// Carrerita, salto con medio giro en el aire, cae de frente con las piernas abiertas y los brazos tirados
// hacia abajo y atrás, el pecho afuera y la cabeza arriba (el grito).
const SIU_LAND: PoseSpec = {
  root: { ry: PI, y: -0.05, z: -0.55 },
  joints: {
    spine: [-0.22, 0, 0],
    head: [-0.3, 0, 0],
    hipL: [-0.05, 0, 0.32],
    hipR: [-0.05, 0, -0.32],
    kneeL: [0.3, 0, 0],
    kneeR: [0.3, 0, 0],
    shoulderL: [0.4, 0, 0.5],
    shoulderR: [0.4, 0, -0.5],
    elbowL: [-0.05, 0, 0],
    elbowR: [-0.05, 0, 0],
  },
};
export const CELEBRATE_SIU: Clip = {
  duration: 2.4,
  loop: false,
  keys: [
    { t: 0, pose: { joints: RELAXED } },
    { t: 0.25, pose: jogStep(0, -0.1, "L") },
    {
      // Carga: agachado, brazos atrás.
      t: 0.45,
      pose: {
        root: { y: -0.1, z: -0.2 },
        joints: {
          spine: [0.35, 0, 0],
          hipL: [-0.55, 0, 0.05],
          hipR: [-0.55, 0, -0.05],
          kneeL: [0.9, 0, 0],
          kneeR: [0.9, 0, 0],
          shoulderL: [0.75, 0, 0.25],
          shoulderR: [0.75, 0, -0.25],
          elbowL: [-0.2, 0, 0],
          elbowR: [-0.2, 0, 0],
        },
      },
    },
    {
      // En el aire, girando: brazos arriba, piernas recogidas.
      t: 0.72,
      pose: {
        root: { ry: PI * 0.55, y: 0.42, z: -0.4 },
        joints: {
          spine: [-0.1, 0, 0],
          head: [-0.15, 0, 0],
          hipL: [-0.35, 0, 0.1],
          hipR: [-0.35, 0, -0.1],
          kneeL: [0.6, 0, 0],
          kneeR: [0.6, 0, 0],
          shoulderL: [-0.2, 0, 2.5],
          shoulderR: [-0.2, 0, -2.5],
          elbowL: [0, 0, 0.2],
          elbowR: [0, 0, -0.2],
        },
      },
    },
    // Cae de frente y clava la pose (amortigua y se queda).
    // Amortigua flexionando (las rodillas, no hundiendo los pies) y se queda.
    { t: 0.98, pose: { ...SIU_LAND, root: { ...SIU_LAND.root, y: -0.07 }, joints: { ...SIU_LAND.joints, kneeL: [0.45, 0, 0], kneeR: [0.45, 0, 0] } } },
    { t: 1.3, pose: SIU_LAND },
    { t: 2.4, pose: { ...SIU_LAND, root: { ...SIU_LAND.root, y: -0.04 } } },
  ],
};

// ── 2. Dedicatoria al cielo (Messi) ──
// Trota hacia la gente con los dos brazos arriba, señalando el cielo, y la mirada hacia arriba.
const SKY_ARMS: Joints = {
  shoulderL: [-0.2, 0, 2.9],
  shoulderR: [-0.2, 0, -2.9],
  elbowL: [-0.08, 0, 0.06],
  elbowR: [-0.08, 0, -0.06],
};
export const CELEBRATE_SKY: Clip = {
  duration: 2.4,
  loop: false,
  keys: [
    { t: 0, pose: { joints: RELAXED } },
    { t: 0.35, pose: jogStep(PI * 0.6, -0.15, "R") },
    { t: 0.7, pose: jogStep(PI, -0.4, "L", { shoulderL: [-0.3, 0, 1.6], shoulderR: [-0.3, 0, -1.6], elbowL: [-0.3, 0, 0], elbowR: [-0.3, 0, 0] }) },
    {
      t: 1.0,
      pose: { ...jogStep(PI, -0.65, "R", SKY_ARMS), joints: { ...jogStep(PI, -0.65, "R", SKY_ARMS).joints, spine: [-0.1, 0, 0], head: [-0.5, 0, 0] } },
    },
    {
      t: 1.4,
      pose: { root: { ry: PI, z: -0.85, y: 0.01 }, joints: { ...SKY_ARMS, spine: [-0.14, 0, 0], head: [-0.55, 0, 0], hipL: [-0.2, 0, 0.04], kneeL: [0.2, 0, 0], hipR: [0.1, 0, -0.04] } },
    },
    {
      t: 2.4,
      pose: {
        root: { ry: PI, z: -0.9 },
        joints: { ...SKY_ARMS, spine: [-0.16, 0, 0], head: [-0.6, 0, 0], hipL: [-0.05, 0, 0.06], hipR: [0, 0, -0.06], kneeL: [0.05, 0, 0] },
      },
    },
  ],
};

// ── 3. Brazos cruzados (Mbappé) ──
// Se para firme de frente, cruza los brazos sobre el pecho (manos bajo las axilas), mentón arriba.
const CROSSED: PoseSpec = {
  root: { ry: PI, z: -0.35 },
  joints: {
    spine: [-0.08, 0, 0],
    head: [-0.2, 0, 0],
    hipL: [0, 0, 0.12],
    hipR: [0, 0, -0.12],
    // Brazo cerca del cuerpo y apenas adelante; el GIRO del hombro (y) lleva el antebrazo hacia adentro, cruzado
    // sobre el pecho. El izquierdo queda encima (más alto) para que no se atraviesen.
    shoulderL: [-0.42, -1.5, 0.05],
    shoulderR: [-0.37, 1.5, -0.05],
    elbowL: [-1.95, 0, 0],
    elbowR: [-1.92, 0, 0],
  },
};
export const CELEBRATE_CROSSED: Clip = {
  duration: 2.4,
  loop: false,
  keys: [
    { t: 0, pose: { joints: RELAXED } },
    { t: 0.3, pose: jogStep(PI * 0.5, -0.12, "L") },
    { t: 0.6, pose: jogStep(PI, -0.3, "R") },
    { t: 0.95, pose: { ...CROSSED, root: { ...CROSSED.root, y: 0.02 } } },
    { t: 2.4, pose: CROSSED },
  ],
};

// ── 4. La cuna (Bebeto, 1994) ──
// Brazos adelante como sosteniendo un bebé y el balanceo de lado a lado (todo el torso acompaña).
const cradle = (side: -1 | 0 | 1): PoseSpec => ({
  root: { ry: PI + side * 0.22, z: -0.4, rz: side * 0.05 },
  joints: {
    spine: [0.12, side * 0.18, 0],
    head: [0.18, side * 0.1, 0],
    hipL: [0, 0, 0.1],
    hipR: [0, 0, -0.1],
    // Antebrazos horizontales adelante, girados hacia adentro (la "cuna"); el balanceo los lleva de lado.
    shoulderL: [-0.45, -0.75 + side * 0.25, 0.12],
    shoulderR: [-0.45, 0.75 + side * 0.25, -0.12],
    elbowL: [-1.45, 0, 0],
    elbowR: [-1.45, 0, 0],
  },
});
export const CELEBRATE_CRADLE: Clip = {
  duration: 2.4,
  loop: false,
  keys: [
    { t: 0, pose: { joints: RELAXED } },
    { t: 0.3, pose: jogStep(PI * 0.5, -0.15, "L") },
    { t: 0.6, pose: cradle(0) },
    { t: 0.9, pose: cradle(1) },
    { t: 1.3, pose: cradle(-1) },
    { t: 1.7, pose: cradle(1) },
    { t: 2.1, pose: cradle(-1) },
    { t: 2.4, pose: cradle(0) },
  ],
};

// ── 5. Rodillazo (Drogba / Henry) ──
// Corre hacia la cámara, se tira de rodillas y se desliza con el torso atrás y los brazos bien abiertos.
// De rodillas: muslo casi vertical (cadera -0,1) y tibia horizontal en el pasto (cadera + rodilla = π/2).
const SLIDE: PoseSpec = {
  root: { ry: PI, y: -0.45, z: -1.6 },
  joints: {
    spine: [-0.32, 0, 0],
    head: [-0.35, 0, 0],
    hipL: [-0.1, 0, 0.12],
    hipR: [-0.1, 0, -0.12],
    kneeL: [1.55, 0, 0],
    kneeR: [1.55, 0, 0],
    // Empeine plano en el pasto (punta hacia atrás), no clavado.
    ankleL: [0.7, 0, 0],
    ankleR: [0.7, 0, 0],
    shoulderL: [0.15, 0, 1.45],
    shoulderR: [0.15, 0, -1.45],
    elbowL: [-0.1, 0, 0],
    elbowR: [-0.1, 0, 0],
  },
};
export const CELEBRATE_SLIDE: Clip = {
  duration: 2.4,
  loop: false,
  keys: [
    { t: 0, pose: { joints: RELAXED } },
    { t: 0.3, pose: jogStep(PI * 0.6, -0.15, "R") },
    { t: 0.55, pose: jogStep(PI, -0.55, "L") },
    {
      // Bajando: una rodilla adelante, el torso empieza a ir atrás, brazos abriéndose.
      t: 0.8,
      pose: {
        root: { ry: PI, y: -0.11, z: -1.0 },
        joints: {
          spine: [-0.15, 0, 0],
          hipL: [-0.4, 0, 0.1],
          kneeL: [1.2, 0, 0],
          hipR: [0.1, 0, -0.1],
          kneeR: [1.4, 0, 0],
          ankleL: [0.5, 0, 0],
          ankleR: [0.6, 0, 0],
          shoulderL: [0.1, 0, 1.0],
          shoulderR: [0.1, 0, -1.0],
          elbowL: [-0.3, 0, 0],
          elbowR: [-0.3, 0, 0],
        },
      },
    },
    // De rodillas, deslizando (frena de a poco).
    { t: 1.05, pose: { ...SLIDE, root: { ...SLIDE.root, z: -1.3 } } },
    { t: 1.6, pose: SLIDE },
    { t: 2.4, pose: { ...SLIDE, joints: { ...SLIDE.joints, spine: [-0.38, 0, 0], head: [-0.45, 0, 0], shoulderL: [0.1, 0, 1.6], shoulderR: [0.1, 0, -1.6] } } },
  ],
};

export const CELEBRATIONS: Record<CelebrationId, Clip> = {
  siu: CELEBRATE_SIU,
  sky: CELEBRATE_SKY,
  crossed: CELEBRATE_CROSSED,
  cradle: CELEBRATE_CRADLE,
  slide: CELEBRATE_SLIDE,
};

export function isCelebrationId(x: unknown): x is CelebrationId {
  return typeof x === "string" && (CELEBRATION_IDS as readonly string[]).includes(x);
}

/** FNV-1a de 32 bits (estable entre navegadores). */
function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** Festejo del gol para un penal: determinista por id → el mismo en todos los clientes. */
export function celebrationFor(penaltyId: string): CelebrationId {
  return CELEBRATION_IDS[fnv1a(penaltyId) % CELEBRATION_IDS.length]!;
}
