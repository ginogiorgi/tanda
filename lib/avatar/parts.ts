/**
 * Catálogo propio de partes del avatar. Cada categoría es una lista de variantes de malla
 * (primitivas low-poly), sin assets externos. Los `id` se persisten en `profiles.avatar`,
 * así que **no renombrar** ids existentes sin migrar datos (agregar nuevos sí es seguro).
 * Ver SPEC §8.2.
 */

import {
  type AvatarConfig,
  type BodyType,
  type PartCategory,
  isHexColor,
} from "./types";

/** Una variante seleccionable dentro de una categoría. */
export interface PartOption {
  /** Id estable persistido en el avatar. */
  id: string;
  /** Etiqueta para la UI (rioplatense). */
  label: string;
}

export const BODY_TYPES: readonly { id: BodyType; label: string }[] = [
  { id: "male", label: "Hombre" },
  { id: "female", label: "Mujer" },
] as const;

export const HAIR_PARTS: readonly PartOption[] = [
  { id: "none", label: "Pelado" },
  { id: "buzz", label: "Rapado" },
  { id: "short", label: "Corto" },
  { id: "bun", label: "Rodete" },
  { id: "mohawk", label: "Mohicano" },
  { id: "long", label: "Largo" },
] as const;

export const TOP_PARTS: readonly PartOption[] = [
  { id: "tee", label: "Remera" },
  { id: "longsleeve", label: "Manga larga" },
  { id: "tank", label: "Musculosa" },
] as const;

export const BOTTOM_PARTS: readonly PartOption[] = [
  { id: "shorts", label: "Short" },
  { id: "pants", label: "Pantalón" },
  { id: "joggers", label: "Jogger" },
] as const;

export const SHOES_PARTS: readonly PartOption[] = [
  { id: "sneakers", label: "Zapatillas" },
  { id: "boots", label: "Botines" },
  { id: "cleats", label: "Tapones" },
] as const;

/** Catálogo por categoría, para iterar genéricamente en el creador (selectores). */
export const PARTS: Record<PartCategory, readonly PartOption[]> = {
  hair: HAIR_PARTS,
  top: TOP_PARTS,
  bottom: BOTTOM_PARTS,
  shoes: SHOES_PARTS,
};

/** Paleta de colores ofrecida para tintar piezas en el creador. */
export const COLOR_PALETTE: readonly string[] = [
  "#e63946", // rojo
  "#f4a261", // naranja
  "#e9c46a", // amarillo
  "#2a9d8f", // verde agua
  "#264653", // azul petróleo
  "#457b9d", // azul
  "#7209b7", // violeta
  "#1d1d1d", // negro
  "#f1f1f1", // blanco
  "#8d5524", // marrón (pelo)
] as const;

function partExists(category: PartCategory, id: string): boolean {
  return PARTS[category].some((p) => p.id === id);
}

/** Avatar por defecto al abrir el creador por primera vez. */
export const DEFAULT_AVATAR: AvatarConfig = {
  bodyType: "male",
  hair: { part: "short", color: "#1d1d1d" },
  top: { part: "tee", color: "#e63946" },
  bottom: { part: "shorts", color: "#264653" },
  shoes: { part: "sneakers", color: "#f1f1f1" },
};

/**
 * Valida que un objeto desconocido (p. ej. `profiles.avatar` de la DB) sea un
 * {@link AvatarConfig} con ids de pieza y colores válidos. Útil antes de renderizar.
 */
export function isValidAvatar(value: unknown): value is AvatarConfig {
  if (typeof value !== "object" || value === null) return false;
  const a = value as Record<string, unknown>;

  if (a.bodyType !== "male" && a.bodyType !== "female") return false;

  const tinted: [PartCategory, unknown][] = [
    ["hair", a.hair],
    ["top", a.top],
    ["bottom", a.bottom],
    ["shoes", a.shoes],
  ];
  for (const [category, raw] of tinted) {
    if (typeof raw !== "object" || raw === null) return false;
    const p = raw as Record<string, unknown>;
    if (typeof p.part !== "string" || !partExists(category, p.part)) return false;
    if (typeof p.color !== "string" || !isHexColor(p.color)) return false;
  }
  return true;
}
