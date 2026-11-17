import { describe, expect, it } from "vitest";
import { makeRng, randInt } from "@/lib/engine/rng";
import { HAIR_STYLES, PALETTES, hairOptionsFor } from "./catalog";
import { DEFAULT_AVATAR, isAvatarV2, parseAvatar, type AvatarV2 } from "./schema";

/** Forma v1 (antes de P7c): ya no se migra, cae al default. */
const V1 = { top: { part: "tee", color: "#e63946" }, hair: { part: "short", color: "#1d1d1d" }, shoes: { part: "sneakers", color: "#f1f1f1" }, bottom: { part: "shorts", color: "#264653" }, bodyType: "male" };


describe("avatar v2", () => {
  it("el default es v2 estricto", () => {
    expect(isAvatarV2(DEFAULT_AVATAR)).toBe(true);
  });

  it("v1 (sin `v: 2`) → default", () => {
    expect(parseAvatar(V1)).toEqual(DEFAULT_AVATAR);
    expect(parseAvatar({ ...V1, bodyType: "female" })).toEqual(DEFAULT_AVATAR);
  });

  it("parse por campo: un dato raro no resetea el resto", () => {
    const ok: AvatarV2 = { ...DEFAULT_AVATAR, body: "female", hair: { style: "long", color: "#CFAE76" } };
    const p = parseAvatar({ ...ok, kit: { shirt: "rojo", shorts: "#2E5A3C" } });
    expect(p.body).toBe("female");
    expect(p.hair).toEqual(ok.hair);
    expect(p.kit).toEqual({ shirt: DEFAULT_AVATAR.kit.shirt, shorts: "#2E5A3C" });
  });

  it("estricto: rechaza colores fuera de paleta, peinado no ofrecido y claves de más", () => {
    expect(isAvatarV2({ ...DEFAULT_AVATAR, skin: "#ffffff" })).toBe(false);
    expect(isAvatarV2({ ...DEFAULT_AVATAR, body: "female", hair: { style: "parted", color: "#1E1B19" } })).toBe(false);
    expect(isAvatarV2({ ...DEFAULT_AVATAR, extra: 1 })).toBe(false);
    expect(isAvatarV2(V1)).toBe(false);
  });

  it("propiedad (2000 casos): parse(cualquier cosa) es un v2 estricto, e idempotente", () => {
    const rng = makeRng(0x7a2b);
    const pick = <T,>(xs: readonly T[]): T => xs[randInt(rng, xs.length)]!;
    const junk = (): unknown =>
      pick<() => unknown>([
        () => null,
        () => 42,
        () => "x",
        () => [],
        () => ({}),
        () => `#${Math.floor(rng() * 0xffffff).toString(16).padStart(6, "0")}`,
        () => pick(PALETTES.kit).hex,
        () => pick(HAIR_STYLES).id,
        () => pick(["male", "female", "otro"]),
      ])();
    for (let i = 0; i < 2000; i++) {
      const raw =
        rng() < 0.5
          ? { v: rng() < 0.8 ? 2 : junk(), body: junk(), skin: junk(), hair: { style: junk(), color: junk() }, kit: rng() < 0.9 ? { shirt: junk(), shorts: junk() } : junk(), boots: { color: junk() } }
          : { bodyType: junk(), hair: { part: pick(["none", "buzz", "mohawk", "short", "long", "bun", "x"]), color: junk() }, top: { color: junk() }, bottom: junk(), shoes: { color: junk() } };
      const p = parseAvatar(raw);
      expect(isAvatarV2(p)).toBe(true);
      expect(parseAvatar(p)).toEqual(p);
      expect(hairOptionsFor(p.body).map((h) => h.id)).toContain(p.hair.style);
    }
  });
});
