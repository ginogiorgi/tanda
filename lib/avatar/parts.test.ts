import { describe, expect, it } from "vitest";
import { DEFAULT_AVATAR, PARTS, isValidAvatar } from "./parts";
import type { PartCategory } from "./types";

describe("avatar parts catalog", () => {
  it("acepta el avatar por defecto", () => {
    expect(isValidAvatar(DEFAULT_AVATAR)).toBe(true);
  });

  it("acepta cualquier combinación de ids del catálogo", () => {
    const categories: PartCategory[] = ["hair", "top", "bottom", "shoes"];
    for (const category of categories) {
      for (const option of PARTS[category]) {
        const avatar = {
          ...DEFAULT_AVATAR,
          [category]: { part: option.id, color: "#abcdef" },
        };
        expect(isValidAvatar(avatar)).toBe(true);
      }
    }
  });

  it("rechaza ids de pieza inexistentes", () => {
    expect(isValidAvatar({ ...DEFAULT_AVATAR, head: "triangular" })).toBe(false);
    expect(
      isValidAvatar({ ...DEFAULT_AVATAR, top: { part: "capa", color: "#ffffff" } }),
    ).toBe(false);
  });

  it("rechaza colores que no son hex #rrggbb", () => {
    expect(
      isValidAvatar({ ...DEFAULT_AVATAR, hair: { part: "short", color: "rojo" } }),
    ).toBe(false);
    expect(
      isValidAvatar({ ...DEFAULT_AVATAR, hair: { part: "short", color: "#fff" } }),
    ).toBe(false);
  });

  it("rechaza valores no-objeto y bodyType inválido", () => {
    expect(isValidAvatar(null)).toBe(false);
    expect(isValidAvatar("avatar")).toBe(false);
    expect(isValidAvatar({ ...DEFAULT_AVATAR, bodyType: "robot" })).toBe(false);
  });
});
