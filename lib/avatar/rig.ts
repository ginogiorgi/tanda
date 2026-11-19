/**
 * Rig del avatar (Fase 6): esqueleto propio de 11 articulaciones + poses + clips por keyframes. TS
 * puro (sin three) → testeable y determinista. `GlbAvatar` registra pivotes con estos nombres (y los
 * traduce a huesos del GLB) y la escena aplica `samplePose(clip, t)` por frame.
 *
 * Convenciones (el avatar mira hacia +Z, pies en y=0):
 *  - Lado `L` = izquierda del personaje = +X. `R` = -X.
 *  - Rotaciones en radianes (Euler XYZ local de cada pivote). Pose de descanso = todo 0 (el modelo
 *    tal como se ve en el creador).
 *  - Pierna/brazo cuelgan hacia -Y: `x` positivo los lleva hacia atrás (-Z), negativo hacia adelante.
 *    Rodilla `x` positivo = flexión natural (el pie va hacia atrás). Codo `x` negativo = antebrazo
 *    hacia adelante.
 *  - Hombro `z`: positivo abre el brazo hacia +X (en L = levantarlo de costado; en R = cruzarlo).
 *  - `root` mueve/rota el cuerpo entero alrededor de su centro (≈ cadera).
 */

export const JOINTS = [
  "hips",
  "spine",
  "head",
  "shoulderL",
  "shoulderR",
  "elbowL",
  "elbowR",
  "hipL",
  "hipR",
  "kneeL",
  "kneeR",
] as const;

export type Joint = (typeof JOINTS)[number];
export type Euler3 = readonly [number, number, number];

export interface RootPose {
  x: number;
  y: number;
  z: number;
  rx: number;
  ry: number;
  rz: number;
}

/** Pose completa (todas las articulaciones resueltas). */
export interface Pose {
  root: RootPose;
  joints: Record<Joint, Euler3>;
}

/** Pose parcial para escribir keyframes: lo que falta queda en 0. */
export interface PoseSpec {
  root?: Partial<RootPose>;
  joints?: Partial<Record<Joint, Euler3>>;
}

export interface Clip {
  /** Duración en segundos (el último keyframe debería caer acá). */
  duration: number;
  /** Si es `true`, `t` se envuelve; si no, se clampa y queda la última pose. */
  loop: boolean;
  keys: readonly { t: number; pose: PoseSpec }[];
}

const ZERO: Euler3 = [0, 0, 0];
const ROOT0: RootPose = { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0 };

export function resolvePose(spec: PoseSpec): Pose {
  const joints = {} as Record<Joint, Euler3>;
  for (const j of JOINTS) joints[j] = spec.joints?.[j] ?? ZERO;
  return { root: { ...ROOT0, ...spec.root }, joints };
}

export const REST: Pose = resolvePose({});

// Forma exacta en los extremos (t=0 → a, t=1 → b): los keyframes se respetan sin error de redondeo.
const lerp = (a: number, b: number, t: number) => a * (1 - t) + b * t;
/** Suavizado entre keyframes: arranca y frena suave (sin quiebres de velocidad). */
export const smoothstep = (t: number) => {
  const c = Math.max(0, Math.min(1, t));
  return c * c * (3 - 2 * c);
};

/** Interpola dos poses (lineal por componente; `w` ya suavizado por quien llama). */
export function blendPose(a: Pose, b: Pose, w: number): Pose {
  const joints = {} as Record<Joint, Euler3>;
  for (const j of JOINTS) {
    const pa = a.joints[j];
    const pb = b.joints[j];
    joints[j] = [lerp(pa[0], pb[0], w), lerp(pa[1], pb[1], w), lerp(pa[2], pb[2], w)];
  }
  const r = {} as RootPose;
  for (const k of Object.keys(ROOT0) as (keyof RootPose)[]) r[k] = lerp(a.root[k], b.root[k], w);
  return { root: r, joints };
}

/** Pose del clip en el instante `t` (s). Determinista: misma entrada → misma pose. */
export function samplePose(clip: Clip, t: number): Pose {
  const keys = clip.keys;
  if (keys.length === 0) return REST;
  let tt = t;
  if (clip.loop && clip.duration > 0) tt = ((t % clip.duration) + clip.duration) % clip.duration;
  if (tt <= keys[0]!.t) return resolvePose(keys[0]!.pose);
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i]!;
    const b = keys[i + 1]!;
    if (tt <= b.t) {
      const w = smoothstep((tt - a.t) / (b.t - a.t));
      return blendPose(resolvePose(a.pose), resolvePose(b.pose), w);
    }
  }
  return resolvePose(keys[keys.length - 1]!.pose);
}

const MIRROR: Record<Joint, Joint> = {
  hips: "hips",
  spine: "spine",
  head: "head",
  shoulderL: "shoulderR",
  shoulderR: "shoulderL",
  elbowL: "elbowR",
  elbowR: "elbowL",
  hipL: "hipR",
  hipR: "hipL",
  kneeL: "kneeR",
  kneeR: "kneeL",
};

/** Espejo izquierda↔derecha (plano X=0): para la estirada del arquero hacia el otro palo. */
export function mirrorPose(p: Pose): Pose {
  const joints = {} as Record<Joint, Euler3>;
  for (const j of JOINTS) {
    const [x, y, z] = p.joints[MIRROR[j]];
    joints[j] = [x, -y, -z];
  }
  return {
    root: { ...p.root, x: -p.root.x, ry: -p.root.ry, rz: -p.root.rz },
    joints,
  };
}

// ─────────────────────────────── Clips ───────────────────────────────

const ARMS_RELAXED: Partial<Record<Joint, Euler3>> = {
  shoulderL: [0, 0, 0.12],
  shoulderR: [0, 0, -0.12],
  elbowL: [-0.15, 0, 0],
  elbowR: [-0.15, 0, 0],
};

/** Parado tranquilo, respirando (creador y pateador antes del remate). */
export const IDLE: Clip = {
  duration: 3.2,
  loop: true,
  keys: [
    { t: 0, pose: { joints: { ...ARMS_RELAXED, spine: [0, 0, 0] } } },
    {
      t: 1.6,
      pose: {
        root: { y: 0.006 },
        joints: {
          ...ARMS_RELAXED,
          spine: [-0.03, 0, 0],
          head: [-0.03, 0, 0],
          shoulderL: [0, 0, 0.16],
          shoulderR: [0, 0, -0.16],
        },
      },
    },
    { t: 3.2, pose: { joints: { ...ARMS_RELAXED, spine: [0, 0, 0] } } },
  ],
};

/**
 * Pateador esperando el remate (feedback 2, P2.2): perfilado detrás de la pelota, rodillas flexionadas,
 * torso adelante, brazos sueltos y un rebote corto. Reemplaza al `IDLE` de parado tranquilo — antes de
 * patear se espera en pose de preparación, no "posando".
 */
const KICKER_SET: PoseSpec = {
  root: { y: -0.03, ry: 0.18 },
  joints: {
    spine: [0.2, 0, 0],
    head: [-0.12, 0, 0],
    hipL: [-0.22, 0, 0.04],
    kneeL: [0.32, 0, 0],
    hipR: [0.12, 0, -0.04],
    kneeR: [0.38, 0, 0],
    shoulderL: [0.12, 0, 0.32],
    shoulderR: [-0.12, 0, -0.32],
    elbowL: [-0.55, 0, 0],
    elbowR: [-0.55, 0, 0],
  },
};

export const KICKER_READY: Clip = {
  duration: 1.4,
  loop: true,
  keys: [
    { t: 0, pose: KICKER_SET },
    { t: 0.7, pose: { ...KICKER_SET, root: { ...KICKER_SET.root, y: -0.05 } } },
    { t: 1.4, pose: KICKER_SET },
  ],
};

/**
 * Remate con la derecha. Contacto con la pelota ≈ 0.3 s (la escena lanza la pelota ahí). La
 * aproximación hacia adelante la mueve la escena (posición), acá van los gestos.
 */
export const KICK: Clip = {
  duration: 0.95,
  loop: false,
  keys: [
    {
      t: 0,
      pose: {
        joints: {
          spine: [0.15, 0, 0],
          hipL: [-0.5, 0, 0],
          kneeL: [0.2, 0, 0],
          hipR: [0.45, 0, 0],
          kneeR: [0.8, 0, 0],
          shoulderL: [0.5, 0, 0.15],
          shoulderR: [-0.5, 0, -0.15],
          elbowL: [-0.4, 0, 0],
          elbowR: [-0.5, 0, 0],
        },
      },
    },
    {
      t: 0.17,
      pose: {
        root: { y: 0.02 },
        joints: {
          spine: [0.05, 0.12, 0],
          hipL: [-0.12, 0, 0],
          kneeL: [0.25, 0, 0],
          hipR: [0.85, 0, 0],
          kneeR: [1.5, 0, 0],
          shoulderL: [-0.2, 0, 0.95],
          shoulderR: [0.45, 0, -0.35],
          elbowL: [-0.3, 0, 0],
          elbowR: [-0.6, 0, 0],
        },
      },
    },
    {
      t: 0.3,
      pose: {
        joints: {
          spine: [-0.22, -0.1, 0],
          hipL: [0.05, 0, 0],
          kneeL: [0.3, 0, 0],
          hipR: [-0.55, 0, 0],
          kneeR: [0.35, 0, 0],
          shoulderL: [-0.3, 0, 1.1],
          shoulderR: [-0.35, 0, -0.55],
          elbowL: [-0.2, 0, 0],
          elbowR: [-0.5, 0, 0],
        },
      },
    },
    {
      t: 0.5,
      pose: {
        root: { y: 0.04 },
        joints: {
          spine: [-0.2, -0.15, 0],
          hipL: [0.1, 0, 0],
          kneeL: [0.2, 0, 0],
          hipR: [-1.35, 0, 0],
          kneeR: [0.3, 0, 0],
          shoulderL: [-0.2, 0, 0.9],
          shoulderR: [-0.5, 0, -0.45],
          elbowL: [-0.3, 0, 0],
          elbowR: [-0.5, 0, 0],
        },
      },
    },
    {
      t: 0.95,
      pose: {
        joints: {
          ...ARMS_RELAXED,
          spine: [0.05, 0, 0],
          hipL: [0.05, 0, 0],
          kneeL: [0.1, 0, 0],
          hipR: [-0.25, 0, 0],
          kneeR: [0.35, 0, 0],
        },
      },
    },
  ],
};

const FISTS_UP: Partial<Record<Joint, Euler3>> = {
  shoulderL: [0, 0, 2.75],
  shoulderR: [0, 0, -2.75],
  elbowL: [0, 0, 0.35],
  elbowR: [0, 0, -0.35],
};

/** Festejo del gol: se da vuelta hacia la cámara y salta con los brazos arriba. */
export const CELEBRATE: Clip = {
  duration: 2.4,
  loop: false,
  keys: [
    { t: 0, pose: { joints: { ...ARMS_RELAXED } } },
    { t: 0.35, pose: { root: { ry: Math.PI, y: 0.02 }, joints: { ...FISTS_UP, spine: [-0.15, 0, 0] } } },
    { t: 0.6, pose: { root: { ry: Math.PI, y: 0.22 }, joints: { ...FISTS_UP, spine: [-0.2, 0, 0], kneeL: [0.6, 0, 0], kneeR: [0.6, 0, 0], hipL: [-0.3, 0, 0], hipR: [-0.3, 0, 0] } } },
    { t: 0.85, pose: { root: { ry: Math.PI, y: 0 }, joints: { ...FISTS_UP, spine: [-0.1, 0, 0] } } },
    { t: 1.1, pose: { root: { ry: Math.PI, y: 0.22 }, joints: { ...FISTS_UP, spine: [-0.2, 0, 0], kneeL: [0.6, 0, 0], kneeR: [0.6, 0, 0], hipL: [-0.3, 0, 0], hipR: [-0.3, 0, 0] } } },
    { t: 1.35, pose: { root: { ry: Math.PI, y: 0 }, joints: { ...FISTS_UP, spine: [-0.1, 0, 0] } } },
    {
      t: 2.4,
      pose: {
        root: { ry: Math.PI },
        joints: {
          spine: [-0.12, 0, 0],
          shoulderL: [0, 0, 2.3],
          shoulderR: [0, 0, -2.3],
          elbowL: [0, 0, 0.6],
          elbowR: [0, 0, -0.6],
        },
      },
    },
  ],
};

/** Lamento (erró o se lo atajaron): manos a la cabeza, cabeza gacha. */
export const DEJECTED: Clip = {
  duration: 0.8,
  loop: false,
  keys: [
    { t: 0, pose: { joints: { ...ARMS_RELAXED } } },
    {
      t: 0.8,
      pose: {
        joints: {
          spine: [0.25, 0, 0],
          head: [0.35, 0, 0],
          shoulderL: [-0.3, 0, 2.45],
          shoulderR: [-0.3, 0, -2.45],
          elbowL: [0, 0, 1.55],
          elbowR: [0, 0, -1.55],
          kneeL: [0.12, 0, 0],
          kneeR: [0.12, 0, 0],
        },
      },
    },
  ],
};

const READY_POSE: PoseSpec = {
  root: { y: -0.085 },
  joints: {
    spine: [0.28, 0, 0],
    head: [-0.2, 0, 0],
    hipL: [-0.45, 0, 0.12],
    hipR: [-0.45, 0, -0.12],
    kneeL: [0.9, 0, 0],
    kneeR: [0.9, 0, 0],
    shoulderL: [0, 0, 0.6],
    shoulderR: [0, 0, -0.6],
    elbowL: [-0.7, 0, 0],
    elbowR: [-0.7, 0, 0],
  },
};

/** Arquero esperando: agachado, brazos abiertos, balanceo de lado a lado. */
export const KEEPER_READY: Clip = {
  duration: 1.6,
  loop: true,
  keys: [
    { t: 0, pose: { ...READY_POSE, root: { ...READY_POSE.root, x: -0.05 } } },
    { t: 0.8, pose: { ...READY_POSE, root: { ...READY_POSE.root, x: 0.05, y: -0.07 } } },
    { t: 1.6, pose: { ...READY_POSE, root: { ...READY_POSE.root, x: -0.05 } } },
  ],
};

/** Pose en el instante del contacto con la pelota, estirada hacia +X (para el otro palo: `mirrorPose`). */
interface DiveContact {
  spec: PoseSpec;
  /** Mano que ataja (hueso `hand_l`) con `root.x/y/z = 0`: promedio hombre/mujer medido sobre el GLB real. */
  hand: readonly [number, number, number];
}

/**
 * Feedback 3 #5: cuerpo en línea y de costado, brazos estirados HACIA la pelota (no los dos clavados arriba
 * de la cabeza). Dos alturas de referencia; entre ellas se interpola. `hand` lo mide `rig.glb.test.ts`
 * (cinemática directa sobre el GLB) — si cambian los ángulos, ese test dice los valores nuevos.
 */
const DIVE_LOW: DiveContact = {
  spec: {
    root: { rz: -1.3 },
    joints: {
      spine: [0, 0, -0.1],
      head: [0, 0, -0.15],
      shoulderL: [0.45, 0, 2.5],
      shoulderR: [0.45, 0, -3.75],
      elbowL: [0, 0, 0.05],
      elbowR: [0, 0, -0.05],
      hipL: [0, 0, 0.25],
      hipR: [0.15, 0, -0.05],
      kneeL: [0.3, 0, 0],
      kneeR: [0.6, 0, 0],
    },
  },
  hand: [0.966, 0.722, 0.136],
};
const DIVE_HIGH: DiveContact = {
  spec: {
    root: { rz: -0.95 },
    joints: {
      spine: [0, 0, -0.12],
      head: [0, 0, -0.15],
      shoulderL: [0.45, 0, 2.75],
      shoulderR: [0.45, 0, -3.6],
      elbowL: [0, 0, 0.05],
      elbowR: [0, 0, -0.05],
      hipL: [0, 0, 0.35],
      hipR: [0.15, 0, -0.1],
      kneeL: [0.3, 0, 0],
      kneeR: [0.7, 0, 0],
    },
  },
  hand: [0.948, 1.168, 0.152],
};
/** Referencias de la estirada (las mide `rig.glb.test.ts`). */
export const DIVE_REFS = { low: DIVE_LOW, high: DIVE_HIGH } as const;
/** Alturas (m) de la mano en las dos poses de referencia: abajo = rasante, arriba = media altura. */
export const DIVE_LOW_Y = 0.55;
export const DIVE_HIGH_Y = 1.3;
/** La mano (muñeca) queda a esta distancia del centro de la pelota, del lado del cuerpo: la palma la toca. */
const PALM = 0.12;

/** A dónde tiene que llegar la mano: `x` lateral (>0, hacia donde se tira), `y` altura, `z` adelante. */
export interface DiveReach {
  x: number;
  y: number;
  z: number;
}

/** Instante (s desde que arranca la estirada) en que la mano llega a `reach`. */
export const DIVE_CONTACT_T = 0.75;
/** Duración total: impulso → vuelo → caída de costado amortiguada. */
export const DIVE_DURATION = 1.15;

/** Pose de contacto para `reach`: ángulos interpolados por altura y traslación tal que la mano quede ahí. */
export function diveContactPose(reach: DiveReach): Pose {
  const h = Math.max(0, Math.min(1, (reach.y - DIVE_LOW_Y) / (DIVE_HIGH_Y - DIVE_LOW_Y)));
  const base = blendPose(resolvePose(DIVE_LOW.spec), resolvePose(DIVE_HIGH.spec), h);
  const hx = DIVE_LOW.hand[0] * (1 - h) + DIVE_HIGH.hand[0] * h;
  const hy = DIVE_LOW.hand[1] * (1 - h) + DIVE_HIGH.hand[1] * h;
  const hz = DIVE_LOW.hand[2] * (1 - h) + DIVE_HIGH.hand[2] * h;
  return { ...base, root: { ...base.root, x: reach.x - PALM - hx, y: reach.y - hy, z: reach.z - hz } };
}

/**
 * Estirada hacia +X: flexión y paso de impulso hacia el lado → vuelo con el cuerpo en línea y la mano en
 * `reach` a `DIVE_CONTACT_T` → caída de costado amortiguada (brazos que bajan, cuerpo apoyado).
 */
export function keeperDive(reach: DiveReach): Clip {
  const contact = diveContactPose(reach);
  const { x, z } = contact.root;
  // Impulso: flexión y paso hacia el lado.
  const load: PoseSpec = {
    root: { x: 0.14, y: -0.17, z: z * 0.3, rz: -0.14 },
    joints: {
      ...READY_POSE.joints,
      spine: [0.3, 0, -0.1],
      hipL: [-0.55, 0, 0.3],
      kneeL: [1.0, 0, 0],
      hipR: [-0.7, 0, -0.05],
      kneeR: [1.25, 0, 0],
      shoulderL: [0.2, 0, 1.0],
      shoulderR: [0.2, 0, -1.0],
    },
  };
  // Despegue: a mitad de camino entre el impulso y el contacto, empujando hacia arriba (los pies no se hunden).
  const mid = blendPose(resolvePose(load), contact, 0.5);
  const takeoff: Pose = { ...mid, root: { ...mid.root, y: mid.root.y + 0.12 } };
  return {
    duration: DIVE_DURATION,
    loop: false,
    keys: [
      { t: 0, pose: READY_POSE },
      { t: 0.28, pose: load },
      { t: 0.5, pose: takeoff },
      { t: DIVE_CONTACT_T, pose: contact },
      {
        t: DIVE_DURATION,
        pose: {
          // De costado sobre el pasto: el brazo de abajo queda a lo largo del cuerpo (no lo atraviesa).
          root: { x: x + 0.12, y: -0.64, z, rz: -1.45 },
          joints: {
            ...contact.joints,
            spine: [0, 0, -0.05],
            shoulderL: [0.35, 0, 3.0],
            shoulderR: [0.35, 0, -3.35],
            hipL: [0, 0, 0.02],
            hipR: [0.2, 0, -0.1],
            kneeL: [0.45, 0, 0],
            kneeR: [0.8, 0, 0],
          },
        },
      },
    ],
  };
}

/** Arquero que atajó: desde donde quedó tirado se arrodilla y se para con los puños arriba. */
export function keeperRecover(dive: Clip): Clip {
  const land = samplePose(dive, dive.duration);
  const { x, z } = land.root;
  return {
    duration: 0.9,
    loop: false,
    keys: [
      { t: 0, pose: land },
      // Se apoya en el brazo y se sienta de costado antes de arrodillarse.
      { t: 0.2, pose: { ...land, root: { ...land.root, y: land.root.y + 0.2, rz: -1.05 }, joints: { ...land.joints, hipL: [-0.6, 0, 0.1], kneeL: [1.2, 0, 0], hipR: [-0.5, 0, -0.1], kneeR: [1.3, 0, 0] } } },
      {
        t: 0.45,
        pose: {
          root: { x, y: -0.28, z, rz: -0.35 },
          joints: { spine: [0.35, 0, 0], hipL: [-1.0, 0, 0.1], kneeL: [1.5, 0, 0], hipR: [-0.2, 0, -0.1], kneeR: [1.6, 0, 0], shoulderL: [0, 0, 0.5], shoulderR: [0, 0, -0.5] },
        },
      },
      { t: 0.9, pose: { root: { x, y: 0.03, z }, joints: { ...FISTS_UP, spine: [-0.15, 0, 0] } } },
    ],
  };
}

/** Inicio de la reacción (s desde el remate): la pelota llega a 1.0 s, el arquero cae a ~1.3 s. */
export const REACTION_AT = 1.6;
/** Crossfade entre el remate/estirada y la reacción (s). */
export const REACTION_BLEND = 0.3;

/**
 * Pose de una secuencia "acción → reacción" en `t`: muestrea la acción hasta `REACTION_AT` y después
 * mezcla suave hacia la reacción (sin saltos de pose).
 */
export function sequencePose(action: Pose | ((t: number) => Pose), reaction: Clip | null, t: number): Pose {
  const actionAt = (tt: number) => (typeof action === "function" ? action(tt) : action);
  if (!reaction || t < REACTION_AT) return actionAt(t);
  const rt = t - REACTION_AT;
  const w = smoothstep(rt / REACTION_BLEND);
  return blendPose(actionAt(t), samplePose(reaction, rt), w);
}
