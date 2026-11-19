import { it } from "vitest";
import { loadFkAvatar } from "@/lib/avatar/fkNode";
import { keeperClips, keeperPoseAt } from "@/lib/penal/keeper";
import { KEEPER_Z, shotPlan } from "@/lib/penal/shot";
it("probe", async () => {
  const fk = await loadFkAvatar("male");
  for (const [r, v] of [["save", 0], ["save", 2], ["goal", 0]] as const) {
    const plan = shotPlan(r, v);
    const c = keeperClips(plan);
    for (const t of [1.0, 1.2, 1.4, 1.6, 2.0, 2.5]) {
      const pose = keeperPoseAt(plan, c, t, 0);
      console.log(r, v, t, ["hand_l", "hand_r", "Head", "pelvis", "foot_l", "foot_r"].map((n) => { const b = fk.bone(n, pose, [0, 0, KEEPER_Z]); return `${n}(${b.x.toFixed(2)},${b.y.toFixed(2)})`; }).join(" "));
    }
  }
}, 60000);
