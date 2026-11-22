/**
 * Retarget del rig propio (`lib/avatar/rig.ts`) a los huesos del GLB de Quaternius (Fase 6b).
 *
 * El rig define rotaciones locales de pivotes sin orientación de reposo (en reposo, todo identidad =
 * el personaje parado con los brazos colgando). Los huesos del GLB tienen orientaciones de bind
 * arbitrarias y el bind es T-pose. Por hueso mapeado:
 *
 *   deseadoModelo = D · C · Wbind        local = padreModelo⁻¹ · deseadoModelo
 *
 * con `D` = producto de las rotaciones del rig a lo largo de su cadena (hips → … → articulación),
 * `C` = corrección de brazo (de T-pose a colgando) en upperarm/lowerarm, y `Wbind` = orientación del
 * hueso en bind (espacio del modelo). Los huesos no mapeados (spine_01/03, cuello, manos, dedos) conservan su local de bind y siguen al padre. Misma convención en ambos: +X izquierda,
 * mira a +Z, metros. `root` (traslación + giro del cuerpo) mueve el `wrapper`.
 */

import * as THREE from "three";
import type { Joint } from "@/lib/avatar/rig";
import type { RigNode } from "./rigPose";

export type ProxyRig = Record<RigNode, THREE.Group>;

/** Articulación del rig → hueso del GLB, en orden padre-antes-que-hijo. */
const BONE_OF: readonly (readonly [Joint, string])[] = [
  ["hips", "pelvis"],
  ["spine", "spine_02"],
  ["head", "Head"],
  ["shoulderL", "upperarm_l"],
  ["elbowL", "lowerarm_l"],
  ["shoulderR", "upperarm_r"],
  ["elbowR", "lowerarm_r"],
  ["hipL", "thigh_l"],
  ["kneeL", "calf_l"],
  ["hipR", "thigh_r"],
  ["kneeR", "calf_r"],
  ["ankleL", "foot_l"],
  ["ankleR", "foot_r"],
];

/** Cadena del rig (de la cadera a la articulación), igual a la jerarquía de pivotes del rig (`rigPose`). */
const CHAIN: Record<Joint, readonly Joint[]> = {
  hips: ["hips"],
  spine: ["hips", "spine"],
  head: ["hips", "spine", "head"],
  shoulderL: ["hips", "spine", "shoulderL"],
  elbowL: ["hips", "spine", "shoulderL", "elbowL"],
  shoulderR: ["hips", "spine", "shoulderR"],
  elbowR: ["hips", "spine", "shoulderR", "elbowR"],
  hipL: ["hips", "hipL"],
  kneeL: ["hips", "hipL", "kneeL"],
  hipR: ["hips", "hipR"],
  kneeR: ["hips", "hipR", "kneeR"],
  ankleL: ["hips", "hipL", "kneeL", "ankleL"],
  ankleR: ["hips", "hipR", "kneeR", "ankleR"],
};

/** Cuánto bajan los brazos desde la T-pose (rad). <π/2 deja aire entre brazo y torso. */
const ARM_DROP = 1.38;
const Z = new THREE.Vector3(0, 0, 1);
const C_L = new THREE.Quaternion().setFromAxisAngle(Z, -ARM_DROP); // +X → abajo
const C_R = new THREE.Quaternion().setFromAxisAngle(Z, ARM_DROP); // -X → abajo
const I = new THREE.Quaternion();

function correction(j: Joint): THREE.Quaternion {
  if (j === "shoulderL" || j === "elbowL") return C_L;
  if (j === "shoulderR" || j === "elbowR") return C_R;
  return I;
}

interface Mapped {
  joint: Joint;
  bone: THREE.Object3D;
  /** C · Wbind, precalculado. */
  cw: THREE.Quaternion;
}

export interface GlbRig {
  scene: THREE.Object3D;
  mapped: Mapped[];
}

/** Orientación de `obj` en el espacio de `scene` (sin la transformación propia de la escena). */
function modelQuat(obj: THREE.Object3D, scene: THREE.Object3D, out: THREE.Quaternion): THREE.Quaternion {
  out.identity();
  for (let o: THREE.Object3D | null = obj; o && o !== scene; o = o.parent) out.premultiply(o.quaternion);
  return out;
}

/** Hueso de mayor peso del vértice `i` (índice en `skeleton.bones`). */
export function dominantBone(geometry: THREE.BufferGeometry, i: number): number {
  const si = geometry.getAttribute("skinIndex");
  const sw = geometry.getAttribute("skinWeight");
  let best = 0;
  let w = -1;
  for (let k = 0; k < 4; k++) {
    const wk = sw.getComponent(i, k);
    if (wk > w) {
      w = wk;
      best = si.getComponent(i, k);
    }
  }
  return best;
}

export function createGlbRig(scene: THREE.Object3D): GlbRig {
  const mapped: Mapped[] = [];
  for (const [joint, name] of BONE_OF) {
    const bone = scene.getObjectByName(name);
    if (!bone) continue;
    const wbind = modelQuat(bone, scene, new THREE.Quaternion());
    mapped.push({ joint, bone, cw: correction(joint).clone().multiply(wbind) });
  }
  return { scene, mapped };
}

const e = new THREE.Quaternion();
const d = new THREE.Quaternion();
const parent = new THREE.Quaternion();

/** Aplica la pose de los pivotes fantasma: `root` al `wrapper`, el resto a los huesos. */
export function driveGlbRig(rig: GlbRig, p: ProxyRig, wrapper: THREE.Object3D | null): void {
  if (wrapper) {
    wrapper.position.copy(p.root.position);
    wrapper.rotation.copy(p.root.rotation);
  }
  for (const m of rig.mapped) {
    d.identity();
    for (const j of CHAIN[m.joint]) d.multiply(e.setFromEuler(p[j].rotation));
    d.multiply(m.cw); // deseado en espacio del modelo
    const par = m.bone.parent;
    if (par && par !== rig.scene) modelQuat(par, rig.scene, parent);
    else parent.identity();
    m.bone.quaternion.copy(parent.invert().multiply(d));
  }
}
