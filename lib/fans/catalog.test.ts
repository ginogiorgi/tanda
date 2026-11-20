import { describe, expect, it } from "vitest";
import { FAV_TEAMS, favByCode, searchFav } from "./catalog";

describe("catálogo de favoritos", () => {
  it("30 clubes con escudo y 48 selecciones con bandera, en orden alfabético", () => {
    expect(FAV_TEAMS.club).toHaveLength(30);
    expect(FAV_TEAMS.nation).toHaveLength(48);
    expect(FAV_TEAMS.club.every((t) => t.crest)).toBe(true);
    expect(FAV_TEAMS.nation.every((t) => t.flag)).toBe(true);
    const names = FAV_TEAMS.nation.map((t) => t.name);
    expect([...names].sort((a, b) => a.localeCompare(b, "es"))).toEqual(names);
  });

  it("busca sin tildes, por nombre corto o código", () => {
    expect(searchFav(FAV_TEAMS.club, "boca").map((t) => t.code)).toEqual(["BOC"]);
    expect(searchFav(FAV_TEAMS.nation, "ARG").some((t) => t.code === "ARG")).toBe(true);
    expect(searchFav(FAV_TEAMS.nation, "japon").map((t) => t.name)).toEqual(["Japón"]);
    expect(searchFav(FAV_TEAMS.club, "")).toHaveLength(30);
    expect(searchFav(FAV_TEAMS.club, "zzz")).toEqual([]);
  });

  it("favByCode", () => {
    expect(favByCode("club", "RIV")?.short).toBe("River");
    expect(favByCode("nation", "XXX")).toBeNull();
    expect(favByCode("club", null)).toBeNull();
  });
});
