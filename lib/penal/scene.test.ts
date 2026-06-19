import { describe, expect, it } from "vitest";
import { DEFAULT_AVATAR } from "@/lib/avatar/parts";
import type { AvatarConfig } from "@/lib/avatar/types";
import type { MatchScene, PenalStartPayload } from "@/lib/realtime/penal";
import type { ParticipantBrief } from "@/lib/realtime/score";
import { resolveSceneRoles } from "./scene";

const HOME = "p-home";
const AWAY = "p-away";

function brief(
  id: string,
  kit: string | null,
  isBot = false,
  sash: string | null = kit ? "#ffffff" : null,
): ParticipantBrief {
  return {
    participant_id: id,
    user_id: isBot ? null : `u-${id}`,
    is_bot: isBot,
    nation_id: kit ? "n" : null,
    nation_code: kit ? "ARG" : null,
    nation_name: kit ? "Argentina" : null,
    flag: kit ? "ar" : null,
    kit_primary: kit,
    kit_secondary: sash,
    accent: kit,
  };
}

const homeAvatar: AvatarConfig = {
  bodyType: "female",
  hair: { part: "long", color: "#1d1d1d" },
  top: { part: "tee", color: "#e63946" },
  bottom: { part: "shorts", color: "#264653" },
  shoes: { part: "cleats", color: "#f1f1f1" },
};

function scene(over: Partial<MatchScene> = {}): MatchScene {
  return {
    match_id: "m1",
    my_participant_id: HOME,
    home: brief(HOME, "#6cabdd"),
    away: brief(AWAY, "#e30613"),
    home_avatar: homeAvatar,
    away_avatar: null, // bot / sin avatar
    ...over,
  };
}

function penal(over: Partial<PenalStartPayload> = {}): PenalStartPayload {
  return {
    penalty_id: "pe1",
    match_id: "m1",
    idx: 1,
    prompt: "?",
    options: ["a", "b", "c"],
    started_at: "2026-06-17T00:00:00Z",
    deadline: "2026-06-17T00:00:10Z",
    server_now: "2026-06-17T00:00:00Z",
    kicker_participant_id: HOME,
    keeper_participant_id: AWAY,
    ...over,
  };
}

describe("resolveSceneRoles", () => {
  it("mapea pateador/arquero a su lado, avatar y kit de nación", () => {
    const roles = resolveSceneRoles(penal(), scene());
    expect(roles).not.toBeNull();
    // home patea → su avatar real + su kit (base + banda)
    expect(roles!.kicker.avatar).toBe(homeAvatar);
    expect(roles!.kicker.kitTop).toBe("#6cabdd");
    expect(roles!.kicker.kitSash).toBe("#ffffff");
    expect(roles!.kicker.brief?.participant_id).toBe(HOME);
    // away ataja → sin avatar (bot) → DEFAULT_AVATAR + su kit
    expect(roles!.keeper.avatar).toBe(DEFAULT_AVATAR);
    expect(roles!.keeper.kitTop).toBe("#e30613");
    expect(roles!.keeper.kitSash).toBe("#ffffff");
  });

  it("kitSash cae a kitTop cuando la nación no tiene segundo color (remera lisa)", () => {
    const roles = resolveSceneRoles(
      penal(),
      scene({ home: brief(HOME, "#006c35", false, null) }),
    );
    expect(roles!.kicker.kitTop).toBe("#006c35");
    expect(roles!.kicker.kitSash).toBe("#006c35"); // banda = base → lisa
  });

  it("invierte roles cuando away patea (penal par)", () => {
    const roles = resolveSceneRoles(
      penal({ idx: 2, kicker_participant_id: AWAY, keeper_participant_id: HOME }),
      scene(),
    );
    expect(roles!.kicker.brief?.participant_id).toBe(AWAY);
    expect(roles!.keeper.brief?.participant_id).toBe(HOME);
  });

  it("kitTop null si la nación no tiene kit (caso dev harness sin nación)", () => {
    const roles = resolveSceneRoles(
      penal(),
      scene({ home: brief(HOME, null), away: brief(AWAY, null, true) }),
    );
    expect(roles!.kicker.kitTop).toBeNull();
    expect(roles!.kicker.kitSash).toBeNull();
    expect(roles!.keeper.kitTop).toBeNull();
  });

  it("avatar inválido cae a DEFAULT_AVATAR", () => {
    const roles = resolveSceneRoles(
      penal(),
      scene({ home_avatar: { bodyType: "alien" } as unknown as AvatarConfig }),
    );
    expect(roles!.kicker.avatar).toBe(DEFAULT_AVATAR);
  });

  it("null sin escena, sin ids de pateador/arquero, o ids inconsistentes", () => {
    expect(resolveSceneRoles(penal(), null)).toBeNull();
    expect(
      resolveSceneRoles(penal({ kicker_participant_id: undefined }), scene()),
    ).toBeNull();
    expect(
      resolveSceneRoles(penal({ kicker_participant_id: "ghost" }), scene()),
    ).toBeNull();
  });
});
