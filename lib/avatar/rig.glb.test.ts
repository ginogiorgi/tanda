import { beforeAll, describe, expect, it } from "vitest";
import { keeperClips, keeperPoseAt } from "@/lib/penal/keeper";
import { BALL_T1, KEEPER_Z, ballAt, shotPlan } from "@/lib/penal/shot";
import { loadFkAvatar, type FkAvatar } from "./fkNode";
import { DIVE_REFS, resolvePose } from "./rig";
import type { BodyType } from "./types";

/**
 * Feedback 3 #5 con el avatar REAL (GLB + retarget, sin navegador): en la atajada la mano del arquero
 * llega a la pelota justo cuando la pelota llega; en el gol queda lejos. Antes las manos pasaban ~1 m de
 * largo y la pelota pegaba en la panza.
 */
const BODIES: BodyType[] = ["male", "female"];
const fk = new Map<BodyType, FkAvatar>();
beforeAll(async () => {
  for (const b of BODIES) fk.set(b, await loadFkAvatar(b));
}, 60_000);

const AT = [0, 0, KEEPER_Z] as const;
const dist = (a: { x: number; y: number; z: number }, b: readonly number[]) => Math.hypot(a.x - b[0]!, a.y - b[1]!, a.z - b[2]!);

describe.each(BODIES)("arquero %s", (body) => {
  it("las referencias de la estirada miden lo que dice `hand` (±5 cm)", () => {
    for (const [k, ref] of Object.entries(DIVE_REFS)) {
      const h = fk.get(body)!.bone("hand_l", resolvePose(ref.spec));
      expect(dist(h, ref.hand), k).toBeLessThan(0.05);
    }
  });

  it.each([0, 1, 2, 3])("atajada %i: la mano toca la pelota en BALL_T1 y el cuerpo no", (v) => {
    const plan = shotPlan("save", v);
    const pose = keeperPoseAt(plan, keeperClips(plan), BALL_T1, 0);
    const ball = ballAt(plan, BALL_T1);
    const a = fk.get(body)!;
    const hand = Math.min(dist(a.bone("hand_l", pose, AT), ball), dist(a.bone("hand_r", pose, AT), ball));
    expect(hand).toBeLessThan(0.3);
    expect(dist(a.bone("Head", pose, AT), ball)).toBeGreaterThan(0.3);
    expect(dist(a.bone("pelvis", pose, AT), ball)).toBeGreaterThan(0.6);
  });

  it.each([0, 1, 2, 3])("gol %i: el arquero no la toca", (v) => {
    const plan = shotPlan("goal", v);
    const clips = keeperClips(plan);
    const a = fk.get(body)!;
    for (let t = 0.6; t <= 1.2; t += 0.1) {
      const pose = keeperPoseAt(plan, clips, t, 0);
      const ball = ballAt(plan, t);
      for (const n of ["hand_l", "hand_r", "Head", "pelvis"]) expect(dist(a.bone(n, pose, AT), ball), `${n} @${t}`).toBeGreaterThan(0.6);
    }
  });

  it.each(["save", "goal", "miss_wide"] as const)("%s: nunca atraviesa el piso", (reason) => {
    const a = fk.get(body)!;
    for (let v = 0; v < 4; v++) {
      const plan = shotPlan(reason, v);
      const clips = keeperClips(plan);
      for (let t = 0; t <= 3; t += 0.1) {
        const pose = keeperPoseAt(plan, clips, t, 0);
        for (const n of ["Head", "pelvis", "hand_l", "hand_r", "foot_l", "foot_r"]) {
          expect(a.bone(n, pose, AT).y, `${n} v${v} @${t.toFixed(1)}`).toBeGreaterThan(n.startsWith("foot") ? -0.03 : 0.02);
        }
      }
    }
  });
});
