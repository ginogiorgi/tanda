import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { CELEBRATION_IDS, CELEBRATIONS } from "@/lib/avatar/celebrations";
import { REACTION_AT, samplePose } from "@/lib/avatar/rig";
import { CELEBRATION_CAM_T, droneCamera, idleCamera, isPortrait, type CameraShot } from "./camera";
import { GOAL_H, GOAL_HALF_W, GOAL_Z, KEEPER_Z, ballAt, shotPlan } from "./shot";
import type { PenaltyReason } from "@/lib/realtime/penal";

/** Proyección (NDC, -1..1) de un punto del mundo con el cuadro dado. */
function project(shot: CameraShot, aspect: number, p: readonly [number, number, number]) {
  const cam = new THREE.PerspectiveCamera(shot.fov, aspect, 0.1, 100);
  cam.position.set(...shot.pos);
  cam.lookAt(...shot.look);
  cam.updateMatrixWorld();
  return new THREE.Vector3(...p).project(cam);
}

const ASPECTS = { celu: 390 / 844, pc: 1440 / 900, tablet: 1024 / 768 } as const;
const REASONS: PenaltyReason[] = ["goal", "save", "miss_wide"];

describe("cámara dron (feedback 3 #1)", () => {
  it("inclinada 45–60° (ni cenital ni a ras del piso)", () => {
    for (const a of Object.values(ASPECTS)) {
      const { pos, look } = idleCamera(a);
      const pitch = (Math.atan2(pos[1] - look[1], pos[2] - look[2]) * 180) / Math.PI;
      expect(pitch).toBeGreaterThan(45);
      expect(pitch).toBeLessThan(60);
    }
  });

  it.each(Object.entries(ASPECTS))("%s: arco entero arriba, pateador y arquero adentro y legibles en toda la jugada", (_, a) => {
    for (const reason of REASONS) {
      for (let v = 0; v < 4; v++) {
        const plan = shotPlan(reason, v);
        for (let t = 0; t <= 3; t += 0.25) {
          const shot = droneCamera(a, plan, t, reason === "save" ? plan.target[0] : ballAt(plan, t)[0]);
          const tag = `${reason}-${v} @${t}`;
          for (const x of [-GOAL_HALF_W, GOAL_HALF_W]) {
            const top = project(shot, a, [x, GOAL_H, GOAL_Z]);
            expect(Math.abs(top.x), `palo ${tag}`).toBeLessThan(0.97);
            expect(top.y, `travesaño ${tag}`).toBeLessThan(0.95);
          }
          const goal = project(shot, a, [0, GOAL_H, GOAL_Z]);
          expect(goal.y, `arco en la mitad de arriba ${tag}`).toBeGreaterThan(0.45);
          const kickerFeet = project(shot, a, [0, 0, 1.3]);
          expect(kickerFeet.y, `pateador ${tag}`).toBeGreaterThan(isPortrait(a) ? -0.4 : -0.9);
          const keeper = project(shot, a, [0, 1.85, KEEPER_Z]).y - project(shot, a, [0, 0, KEEPER_Z]).y;
          expect(keeper, `arquero legible ${tag}`).toBeGreaterThan(0.17);
        }
      }
    }
  });

  it.each(Object.entries(ASPECTS))("%s: en el gol la cámara se acerca al festejo y lo sigue entero", (_, a) => {
    const plan = shotPlan("goal", 1);
    for (const id of CELEBRATION_IDS) {
      const clip = CELEBRATIONS[id];
      for (let t = CELEBRATION_CAM_T; t <= REACTION_AT + clip.duration + 1; t += 0.1) {
        const root = samplePose(clip, Math.min(clip.duration, t - REACTION_AT)).root;
        // El grupo del pateador está girado π: su +z local es -z del mundo.
        const feet = [-root.x, 0, 0.2 - root.z] as const;
        const shot = droneCamera(a, plan, t, 0, feet);
        const tag = `${id} @${t.toFixed(1)}`;
        const [foot, head] = [project(shot, a, feet), project(shot, a, [feet[0], 1.95, feet[2]])];
        for (const p of [foot, head]) {
          expect(Math.abs(p.x), `x ${tag}`).toBeLessThan(0.85);
          expect(Math.abs(p.y), `y ${tag}`).toBeLessThan(0.95);
        }
        if (t >= CELEBRATION_CAM_T + 0.9) {
          // Primer plano: el cuerpo ocupa ≥ 35% del alto del cuadro (antes ~6%).
          expect(head.y - foot.y, `tamaño ${tag}`).toBeGreaterThan(0.7);
          // En celu queda abajo de la mitad (arriba va el cartel).
          if (isPortrait(a)) expect(head.y, `debajo del cartel ${tag}`).toBeLessThan(0.25);
        }
      }
    }
  });

  it("en PC se ve la medialuna; idle sin jugada = cuadro fijo", () => {
    expect(project(idleCamera(ASPECTS.pc), ASPECTS.pc, [0, 0, 5.4]).y).toBeGreaterThan(-1);
    expect(droneCamera(ASPECTS.pc, null, 2, 0)).toEqual(idleCamera(ASPECTS.pc));
  });
});
