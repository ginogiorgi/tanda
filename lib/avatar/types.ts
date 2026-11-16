/**
 * Tipos base del avatar 3D. La forma persistida (v2) vive en `schema.ts` y el catálogo en `catalog.ts`.
 * En el penal el avatar va tal cual lo armó el jugador SALVO la camiseta, que toma el `kit_primary` de
 * la nación vía el override de runtime `kitTop` del render (no se persiste). Ver SPEC §8.2 / §8.3 #1.
 */

/** Cuerpo base. Define el rig y la silueta; las piezas modulares se montan encima. */
export type BodyType = "male" | "female";

/**
 * Color de pieza como hex `#rrggbb`. Se aplica por tintado del material (no hay una malla
 * por color). Se valida en runtime con {@link isHexColor}.
 */
export type HexColor = string;

const HEX_COLOR_REGEX = /^#[0-9a-fA-F]{6}$/;

export function isHexColor(value: string): value is HexColor {
  return HEX_COLOR_REGEX.test(value);
}
