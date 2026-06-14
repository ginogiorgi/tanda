/**
 * Tipos del avatar 3D. El avatar es un objeto serializable que se guarda en
 * `profiles.avatar` (jsonb) y se usa para reconstruir el personaje en el creador y en la
 * escena de penal. NO lleva color de nación: en el penal el avatar va tal cual lo armó el
 * jugador; la selección se lee solo en HUD/bandera. Ver SPEC §8.2 / §8.3 #1.
 */

/** Cuerpo base. Define el rig y la silueta; las piezas modulares se montan encima. */
export type BodyType = "male" | "female";

/**
 * Color de pieza como hex `#rrggbb`. Se aplica por tintado del material (no hay una malla
 * por color). Se valida en runtime con {@link isHexColor}.
 */
export type HexColor = string;

/** Pieza con color tintable (pelo, remera, pantalón, zapatos). */
export interface TintedPart {
  /** Id de la malla dentro del catálogo de su categoría (ver `parts.ts`). */
  part: string;
  /** Color de tintado del material. */
  color: HexColor;
}

/**
 * Avatar serializable. La cabeza es fija por cuerpo (hombre/mujer): no hay variantes de
 * forma de cabeza, solo de pelo. El resto son piezas tintables.
 */
export interface AvatarConfig {
  bodyType: BodyType;
  hair: TintedPart;
  /** Remera. */
  top: TintedPart;
  /** Pantalón. */
  bottom: TintedPart;
  shoes: TintedPart;
}

/** Categorías de pieza intercambiable expuestas en el creador. */
export type PartCategory = "hair" | "top" | "bottom" | "shoes";

const HEX_COLOR_REGEX = /^#[0-9a-fA-F]{6}$/;

export function isHexColor(value: string): value is HexColor {
  return HEX_COLOR_REGEX.test(value);
}
