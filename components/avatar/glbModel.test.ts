import * as THREE from "three";
import { beforeAll, describe, expect, it } from "vitest";
import { loadGlbScene } from "@/lib/avatar/glbNode";
import type { BodyType } from "@/lib/avatar/types";
import { BODIES, createUniforms, instantiate, templateOf } from "./glbModel";

/** Ángulo (grados) entre el húmero (hombro → codo) y la vertical hacia abajo. */
function armAngle(scene: THREE.Object3D, side: "l" | "r"): number {
  scene.updateMatrixWorld(true);
  const a = scene.getObjectByName(`upperarm_${side}`)!.getWorldPosition(new THREE.Vector3());
  const b = scene.getObjectByName(`lowerarm_${side}`)!.getWorldPosition(new THREE.Vector3());
  return THREE.MathUtils.radToDeg(b.sub(a).normalize().angleTo(new THREE.Vector3(0, -1, 0)));
}

const scenes = new Map<BodyType, THREE.Group>();
beforeAll(async () => {
  for (const b of BODIES) scenes.set(b, await loadGlbScene(b));
}, 60_000);

describe.each(BODIES)("avatar GLB %s: nunca en T-pose", (body) => {
  it("el bind del pack ES T-pose (el test discrimina)", () => {
    const t = templateOf(scenes.get(body)!, body);
    expect(armAngle(t, "l")).toBeGreaterThan(70);
    expect(armAngle(t, "r")).toBeGreaterThan(70);
  });

  it("una instancia recién creada, sin ningún frame, tiene los brazos abajo", () => {
    const inst = instantiate(templateOf(scenes.get(body)!, body), createUniforms());
    expect(armAngle(inst.scene, "l")).toBeLessThan(35);
    expect(armAngle(inst.scene, "r")).toBeLessThan(35);
  });
});
