/**
 * Catálogo único del avatar v2 (feedback 2, P7b). Lo leen el creador, `GlbAvatar`, la galería de QA,
 * el parser (`schema.ts`), el migrador y los tests: no hay otra lista de peinados ni de colores.
 * Los `id` se persisten en `profiles.avatar` → **no renombrar** sin migrar datos (agregar sí).
 */
import { BOOTS_PALETTE, HAIR_PALETTE, KIT_PALETTE, SKIN_PALETTE, type Swatch } from "./palette";
import type { BodyType } from "./types";

export const BODY_TYPES: readonly { id: BodyType; label: string }[] = [
  { id: "male", label: "Hombre" },
  { id: "female", label: "Mujer" },
];

export type HairStyle = "none" | "buzz" | "parted" | "long" | "ponytail" | "bun";

export interface HairOption {
  id: HairStyle;
  label: string;
  /**
   * Malla del GLB por cuerpo (`null` = pelado). Sin entrada para un cuerpo → ese cuerpo no lo ofrece
   * (no pasó el QA de cobertura de P7a) y cae a `fallback`.
   */
  bodies: Partial<Record<BodyType, string | null>>;
  fallback: HairStyle;
}

export const HAIR_STYLES: readonly HairOption[] = [
  { id: "none", label: "Pelado", bodies: { male: null, female: null }, fallback: "none" },
  // Mujer sin rapado (pedido de Gino 16/11): en su lugar, la cola de caballo.
  { id: "buzz", label: "Rapado", bodies: { male: "Hair_Buzzed" }, fallback: "ponytail" },
  { id: "parted", label: "Corto", bodies: { male: "Hair_SimpleParted" }, fallback: "bun" },
  { id: "long", label: "Largo", bodies: { male: "Hair_Long", female: "Hair_Long" }, fallback: "long" },
  { id: "ponytail", label: "Cola", bodies: { female: "Hair_Ponytail" }, fallback: "long" },
  { id: "bun", label: "Rodete", bodies: { male: "Hair_Buns", female: "Hair_Buns" }, fallback: "bun" },
];

export const HAIR_MESHES = [
  "Hair_SimpleParted",
  "Hair_Long",
  "Hair_Buzzed",
  "Hair_BuzzedFemale",
  "Hair_Buns",
  "Hair_Ponytail",
] as const;

/**
 * Mallas que se prenden JUNTO con la del peinado. La cola (`Hair_Ponytail`, generada en
 * `components/avatar/glbPonytail.ts`) va sobre el casquete corto de mujer: pelo tirado para atrás.
 */
export const HAIR_LAYERS: Partial<Record<string, readonly string[]>> = {
  Hair_Ponytail: ["Hair_BuzzedFemale"],
};

/** Todas las mallas visibles de un peinado (la principal + sus capas). */
export function hairMeshes(mesh: string | null): readonly string[] {
  return mesh ? [mesh, ...(HAIR_LAYERS[mesh] ?? [])] : [];
}

export function isHairStyle(v: unknown): v is HairStyle {
  return HAIR_STYLES.some((h) => h.id === v);
}

export function hairOffered(style: HairStyle, body: BodyType): boolean {
  return body in HAIR_STYLES.find((h) => h.id === style)!.bodies;
}

/** Peinado válido para ese cuerpo (el pedido o su `fallback`). */
export function hairFor(style: HairStyle, body: BodyType): HairStyle {
  return hairOffered(style, body) ? style : HAIR_STYLES.find((h) => h.id === style)!.fallback;
}

export function hairOptionsFor(body: BodyType): readonly HairOption[] {
  return HAIR_STYLES.filter((h) => body in h.bodies);
}

/** Malla del GLB del peinado en ese cuerpo (`null` = pelado). */
export function hairMesh(style: HairStyle, body: BodyType): string | null {
  return HAIR_STYLES.find((h) => h.id === hairFor(style, body))!.bodies[body] ?? null;
}

/** Paleta por campo de color del avatar. */
export const PALETTES = {
  skin: SKIN_PALETTE,
  hair: HAIR_PALETTE,
  kit: KIT_PALETTE,
  boots: BOOTS_PALETTE,
} as const satisfies Record<string, readonly Swatch[]>;

export function inPalette(palette: readonly Swatch[], hex: unknown): hex is string {
  return typeof hex === "string" && palette.some((s) => s.hex.toLowerCase() === hex.toLowerCase());
}
