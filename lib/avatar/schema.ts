/**
 * Avatar v2 (feedback 2, P7b): lo que se guarda en `profiles.avatar`. Todo color sale de una paleta del
 * catálogo y todo peinado existe en ese cuerpo. El parser es POR CAMPO (un dato raro no resetea el resto)
 * y cualquier cosa que no sea v2 (p. ej. un v1 de antes de P7c; prod ya es 100% v2) cae al default.
 *
 * Sin zod en runtime (está solo en dev y sumaría ~13 KB gz a la ruta del creador): el catálogo ya define
 * todo lo válido.
 */
import { PALETTES, hairFor, inPalette, isHairStyle, type HairStyle } from "./catalog";
import { nearestSwatch, type Swatch } from "./palette";
import type { BodyType, HexColor } from "./types";

export interface AvatarV2 {
  v: 2;
  body: BodyType;
  skin: HexColor;
  hair: { style: HairStyle; color: HexColor };
  kit: { shirt: HexColor; shorts: HexColor };
  boots: { color: HexColor };
}

export const DEFAULT_AVATAR: AvatarV2 = {
  v: 2,
  body: "male",
  skin: "#A06B45",
  hair: { style: "parted", color: "#3A2A20" },
  kit: { shirt: "#A8352B", shorts: "#1F2B47" },
  boots: { color: "#1C1C1C" },
};

const obj = (v: unknown): Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

const HEX = /^#[0-9a-fA-F]{6}$/;

/** Color del campo: el de la paleta si está, el más cercano si es un hex suelto, si no el default. */
function color(palette: readonly Swatch[], raw: unknown, fallback: HexColor): HexColor {
  if (inPalette(palette, raw)) return palette.find((s) => s.hex.toLowerCase() === raw.toLowerCase())!.hex;
  if (typeof raw === "string" && HEX.test(raw)) return nearestSwatch(palette, raw).hex;
  return fallback;
}

function body(raw: unknown): BodyType {
  return raw === "female" ? "female" : "male";
}

/** Cualquier cosa → avatar v2 válido del catálogo (v2 se sanea campo por campo; lo demás → default). */
export function parseAvatar(raw: unknown): AvatarV2 {
  const a = obj(raw);
  if (a.v !== 2) return DEFAULT_AVATAR;
  const d = DEFAULT_AVATAR;
  const b = body(a.body);
  const hair = obj(a.hair);
  const kit = obj(a.kit);
  return {
    v: 2,
    body: b,
    skin: color(PALETTES.skin, a.skin, d.skin),
    hair: {
      style: hairFor(isHairStyle(hair.style) ? hair.style : d.hair.style, b),
      color: color(PALETTES.hair, hair.color, d.hair.color),
    },
    kit: { shirt: color(PALETTES.kit, kit.shirt, d.kit.shirt), shorts: color(PALETTES.kit, kit.shorts, d.kit.shorts) },
    boots: { color: color(PALETTES.boots, obj(a.boots).color, d.boots.color) },
  };
}

/** Validación ESTRICTA para guardar: v2 exacto, colores de paleta y peinado ofrecido en ese cuerpo. */
export function isAvatarV2(raw: unknown): raw is AvatarV2 {
  const a = obj(raw);
  const hair = obj(a.hair);
  const kit = obj(a.kit);
  const keys = (o: Record<string, unknown>, ks: string[]) => Object.keys(o).sort().join() === [...ks].sort().join();
  return (
    a.v === 2 &&
    keys(a, ["v", "body", "skin", "hair", "kit", "boots"]) &&
    (a.body === "male" || a.body === "female") &&
    inPalette(PALETTES.skin, a.skin) &&
    keys(hair, ["style", "color"]) &&
    isHairStyle(hair.style) &&
    hairFor(hair.style, a.body) === hair.style &&
    inPalette(PALETTES.hair, hair.color) &&
    keys(kit, ["shirt", "shorts"]) &&
    inPalette(PALETTES.kit, kit.shirt) &&
    inPalette(PALETTES.kit, kit.shorts) &&
    keys(obj(a.boots), ["color"]) &&
    inPalette(PALETTES.boots, obj(a.boots).color)
  );
}
