/**
 * Puente entre el rig puro (`lib/avatar/rig.ts`) y la jerarquía de pivotes de `AvatarModel`. Se usa
 * dentro de `useFrame`: muta transforms (sin re-render de React).
 */
import { useCallback, useRef, type RefObject } from "react";
import type { Group } from "three";
import { JOINTS, type Joint, type Pose } from "@/lib/avatar/rig";

export type RigNode = Joint | "root";
export type RigHandles = Partial<Record<RigNode, Group>>;
export type RigRegister = (node: RigNode, group: Group | null) => void;

/** Handles del esqueleto + callback para que `AvatarModel` registre sus pivotes. */
export function useRig(): { handles: RefObject<RigHandles>; register: RigRegister } {
  const handles = useRef<RigHandles>({});
  const register = useCallback<RigRegister>((node, group) => {
    if (group) handles.current[node] = group;
    else delete handles.current[node];
  }, []);
  return { handles, register };
}

/** Altura del pivote raíz (cadera) en unidades del modelo, pies en y=0. */
export const ROOT_PIVOT_Y = 0.92;

export function applyPose(rig: RigHandles, pose: Pose): void {
  const root = rig.root;
  if (root) {
    root.position.set(pose.root.x, ROOT_PIVOT_Y + pose.root.y, pose.root.z);
    root.rotation.set(pose.root.rx, pose.root.ry, pose.root.rz);
  }
  for (const j of JOINTS) {
    const g = rig[j];
    if (!g) continue;
    const [x, y, z] = pose.joints[j];
    g.rotation.set(x, y, z);
  }
}
