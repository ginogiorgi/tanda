import { describe, expect, it } from "vitest";
import { makeRng } from "@/lib/engine/rng";
import { PRESETS, kitReadable, randomAvatar } from "./presets";
import { isAvatarV2 } from "./schema";

describe("presets y aleatorio del creador", () => {
  it("8 presets v2 estrictos, legibles, con los dos cuerpos y pieles variadas", () => {
    expect(PRESETS).toHaveLength(8);
    for (const { label, avatar } of PRESETS) {
      expect(isAvatarV2(avatar), label).toBe(true);
      expect(kitReadable(avatar), label).toBe(true);
    }
    expect(new Set(PRESETS.map((x) => x.avatar.body)).size).toBe(2);
    expect(new Set(PRESETS.map((x) => x.avatar.skin)).size).toBeGreaterThanOrEqual(5);
  });

  it("aleatorio (1000 tiradas): siempre v2 estricto, legible y camiseta ≠ short", () => {
    const rng = makeRng(0xd1ce);
    for (let i = 0; i < 1000; i++) {
      const a = randomAvatar(rng);
      expect(isAvatarV2(a)).toBe(true);
      expect(kitReadable(a)).toBe(true);
      expect(a.kit.shirt).not.toBe(a.kit.shorts);
    }
  });
});
