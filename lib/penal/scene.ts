/**
 * Helpers puros de la escena de penal 3D (sin red, sin three → testeables). Mapean el penal en
 * curso ({@link PenalStartPayload}, que trae quién patea/ataja) + los datos estáticos del partido
 * ({@link MatchScene}: briefs de nación + avatares) a lo que la escena necesita: para el pateador y
 * el arquero, su avatar (config) y el color de camiseta (`kitTop` = `kit_primary` de su nación).
 *
 * El avatar va tal cual lo armó el jugador SALVO la camiseta, que se tiñe con la nación (SPEC
 * §8.3 #1). Bots/usuarios sin avatar → `DEFAULT_AVATAR`; naciones sin kit (p. ej. el dev harness) →
 * `kitTop` null y la escena usa el `kit.shirt` propio del avatar.
 *
 * Patrón espejo de `lib/lobby/presence.ts` y `lib/realtime/penal.ts`.
 */

import { parseAvatar, type AvatarV2 } from "@/lib/avatar/schema";
import { isHexColor, type HexColor } from "@/lib/avatar/types";
import type { MatchScene, PenalStartPayload } from "@/lib/realtime/penal";
import type { ParticipantBrief } from "@/lib/realtime/score";

/** Render de un rol (pateador o arquero) en la escena. */
export type SceneRole = {
  /** Avatar a renderizar (validado; `DEFAULT_AVATAR` si el jugador no tiene uno válido). */
  avatar: AvatarV2;
  /** Color de camiseta de la nación (override del `top`), o `null` si la nación no tiene kit. */
  kitTop: HexColor | null;
  /**
   * Color de la banda diagonal cruzada de la remera (`kit_secondary`). `null` si no hay kit; si es
   * igual a `kitTop`, la banda se funde y la remera se ve lisa (naciones sin segundo color).
   */
  kitSash: HexColor | null;
  /** Brief de nación del participante (bandera/código/nombre), `null` si no se conoce. */
  brief: ParticipantBrief | null;
};

export type SceneRoles = {
  kicker: SceneRole;
  keeper: SceneRole;
};

/** Avatar v2 (inválido/ausente → default). */
const avatarOf = parseAvatar;

/** Color de kit de la nación si es un hex válido, si no `null`. */
function kitOf(brief: ParticipantBrief | null): HexColor | null {
  const kit = brief?.kit_primary;
  return kit && isHexColor(kit) ? kit : null;
}

/**
 * Color de la banda diagonal (`kit_secondary`). Cae al `kit_primary` si falta o es inválido, de modo
 * que sin segundo color la banda se funde con la base (remera lisa) en vez de desaparecer el override.
 */
function sashOf(brief: ParticipantBrief | null): HexColor | null {
  const sash = brief?.kit_secondary;
  if (sash && isHexColor(sash)) return sash;
  return kitOf(brief);
}

/**
 * Resuelve el rol (avatar + kit + brief) de un participante mirando de qué lado del partido está.
 * `null` si el id no matchea ninguno de los dos lados (no debería pasar con datos consistentes).
 */
function roleFor(participantId: string, scene: MatchScene): SceneRole | null {
  if (scene.home?.participant_id === participantId) {
    return {
      avatar: avatarOf(scene.home_avatar),
      kitTop: kitOf(scene.home),
      kitSash: sashOf(scene.home),
      brief: scene.home,
    };
  }
  if (scene.away?.participant_id === participantId) {
    return {
      avatar: avatarOf(scene.away_avatar),
      kitTop: kitOf(scene.away),
      kitSash: sashOf(scene.away),
      brief: scene.away,
    };
  }
  return null;
}

/**
 * Mapea el penal en curso + la escena a los roles de pateador y arquero. `null` si faltan datos
 * (sin escena, sin ids de pateador/arquero, o ids inconsistentes) → la pantalla degrada a solo la
 * tarjeta 2D sin escena.
 */
export function resolveSceneRoles(
  penal: PenalStartPayload,
  scene: MatchScene | null,
): SceneRoles | null {
  if (!scene) return null;
  const { kicker_participant_id: kickerId, keeper_participant_id: keeperId } = penal;
  if (!kickerId || !keeperId) return null;
  const kicker = roleFor(kickerId, scene);
  const keeper = roleFor(keeperId, scene);
  if (!kicker || !keeper) return null;
  return { kicker, keeper };
}
