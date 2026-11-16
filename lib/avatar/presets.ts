/**
 * Puntos de partida del creador (feedback 2, P7d): 8 presets armados con el catálogo (variedad de cuerpo,
 * piel y pelo) + un aleatorio que solo arma combinaciones válidas y legibles (ropa con ΔE ≥ 15 contra la
 * piel: si no, se lee "desnudo").
 */
import { PALETTES, hairOptionsFor } from "./catalog";
import { deltaE, MIN_KIT_SKIN_DELTA_E } from "./palette";
import type { AvatarV2 } from "./schema";
import type { BodyType } from "./types";

const p = (
  label: string,
  body: BodyType,
  skin: string,
  style: AvatarV2["hair"]["style"],
  hair: string,
  shirt: string,
  shorts: string,
  boots: string,
): { label: string; avatar: AvatarV2 } => ({
  label,
  avatar: { v: 2, body, skin, hair: { style, color: hair }, kit: { shirt, shorts }, boots: { color: boots } },
});

export const PRESETS: readonly { label: string; avatar: AvatarV2 }[] = [
  p("El 9", "male", "#A06B45", "parted", "#1E1B19", "#8FB2D3", "#1C1C1C", "#1C1C1C"),
  p("La 10", "female", "#E0B593", "long", "#5B3E2B", "#2C4A9A", "#ECE6D8", "#A8352B"),
  p("El 5", "male", "#4D3020", "buzz", "#1E1B19", "#A8352B", "#1F2B47", "#ECE6D8"),
  p("La 7", "female", "#764A2E", "bun", "#1E1B19", "#C4A042", "#1C1C1C", "#1C1C1C"),
  p("El arquero", "male", "#F2D3BC", "long", "#CFAE76", "#2E5A3C", "#1C1C1C", "#C4A042"),
  p("La 4", "female", "#C68E66", "ponytail", "#3A2A20", "#6B2433", "#ECE6D8", "#2C4A9A"),
  p("El 8", "male", "#C68E66", "none", "#1E1B19", "#ECE6D8", "#1F2B47", "#8A8984"),
  p("El capitán", "male", "#E0B593", "bun", "#A9A6A0", "#1C1C1C", "#8A8984", "#A8352B"),
];

/** ¿La ropa se distingue de la piel? */
export function kitReadable(a: AvatarV2): boolean {
  return deltaE(a.kit.shirt, a.skin) >= MIN_KIT_SKIN_DELTA_E && deltaE(a.kit.shorts, a.skin) >= MIN_KIT_SKIN_DELTA_E;
}

/** Avatar al azar del catálogo (`rng` ∈ [0,1)); camiseta ≠ short y ropa legible contra la piel. */
export function randomAvatar(rng: () => number): AvatarV2 {
  const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(rng() * xs.length)]!;
  const body: BodyType = rng() < 0.5 ? "male" : "female";
  const skin = pick(PALETTES.skin).hex;
  const kit = PALETTES.kit.filter((s) => deltaE(s.hex, skin) >= MIN_KIT_SKIN_DELTA_E);
  const shirt = pick(kit).hex;
  const shorts = pick(kit.filter((s) => s.hex !== shirt)).hex;
  return {
    v: 2,
    body,
    skin,
    hair: { style: pick(hairOptionsFor(body)).id, color: pick(PALETTES.hair).hex },
    kit: { shirt, shorts },
    boots: { color: pick(PALETTES.boots).hex },
  };
}
