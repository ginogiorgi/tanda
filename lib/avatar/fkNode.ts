/**
 * Cinemática directa del avatar REAL en Node (tests y QA): carga el GLB, le aplica una pose del rig con
 * el mismo retarget que la escena (`driveGlbRig`) y devuelve posiciones de huesos en el mundo. Permite
 * testear que la mano del arquero llega a la pelota sin abrir un navegador.
 */
import * as THREE from "three";
import { createProxies, createUniforms, instantiate, templateOf } from "@/components/avatar/glbModel";
import { driveGlbRig } from "@/components/avatar/glbRig";
import { applyPose, ROOT_PIVOT_Y } from "@/components/avatar/rigPose";
import { loadGlbScene } from "./glbNode";
import type { Pose } from "./rig";
import type { BodyType } from "./types";

export interface FkAvatar {
  /** Posición mundial de un hueso del GLB con la pose aplicada, con el avatar parado en `at`. */
  bone(name: string, pose: Pose, at?: readonly [number, number, number]): THREE.Vector3;
}

export async function loadFkAvatar(body: BodyType): Promise<FkAvatar> {
  const inst = instantiate(templateOf(await loadGlbScene(body), body), createUniforms());
  const outer = new THREE.Group();
  const wrapper = new THREE.Group();
  const inner = new THREE.Group();
  inner.position.y = -ROOT_PIVOT_Y;
  outer.add(wrapper);
  wrapper.add(inner);
  inner.add(inst.scene);
  const proxies = createProxies();
  return {
    bone(name, pose, at = [0, 0, 0]) {
      outer.position.set(at[0], at[1], at[2]);
      applyPose(proxies, pose);
      driveGlbRig(inst.glbRig, proxies, wrapper);
      outer.updateMatrixWorld(true);
      const b = inst.scene.getObjectByName(name);
      if (!b) throw new Error(`hueso ${name} no existe`);
      return b.getWorldPosition(new THREE.Vector3());
    },
  };
}
