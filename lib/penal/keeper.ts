/**
 * Arquero en la jugada (feedback 3 #5): TS puro, compartido por la escena 3D y el test de cinemática
 * directa (`lib/avatar/rig.glb.test.ts`) → lo que se testea es exactamente lo que se ve.
 */
import { KEEPER_READY, blendPose, keeperDive, keeperRecover, mirrorPose, samplePose, sequencePose, smoothstep, type Clip, type Pose } from "@/lib/avatar/rig";
import type { ShotPlan } from "./shot";

export interface KeeperClips {
  dive: Clip;
  /** Solo si ataja: se levanta con los puños arriba. En el gol queda tirado. */
  recover: Clip | null;
}

export function keeperClips(plan: ShotPlan): KeeperClips {
  const dive = keeperDive(plan.reach);
  return { dive, recover: plan.reason === "save" ? keeperRecover(dive) : null };
}

/** Pose del arquero en `t` (s desde que se resuelve el penal). `idleT` = reloj del balanceo previo. */
export function keeperPoseAt(plan: ShotPlan, clips: KeeperClips, t: number, idleT: number): Pose {
  const ready = samplePose(KEEPER_READY, idleT);
  const t0 = plan.diveT0;
  const action = (tt: number) => (tt < t0 ? ready : blendPose(ready, samplePose(clips.dive, tt - t0), smoothstep((tt - t0) / 0.12)));
  const p = sequencePose(action, clips.recover, t);
  return plan.keeperDir < 0 ? mirrorPose(p) : p;
}
