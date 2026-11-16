/**
 * Catálogo propio de partes del avatar. Cada categoría es una lista de variantes de malla
 * (`GlbAvatar` mapea cada id a su malla del GLB). Los `id` se persisten en `profiles.avatar`,
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

const HAIR_PARTS: readonly PartOption[] = [
  { id: "none", label: "Pelado" },
  { id: "buzz", label: "Rapado" },
  { id: "short", label: "Corto" },
  { id: "bun", label: "Rodete" },
  { id: "mohawk", label: "Mohicano" },
  { id: "long", label: "Largo" },
] as const;

const TOP_PARTS: readonly PartOption[] = [
  { id: "tee", label: "Remera" },
  { id: "longsleeve", label: "Manga larga" },
  { id: "tank", label: "Musculosa" },
] as const;

const BOTTOM_PARTS: readonly PartOption[] = [
  { id: "shorts", label: "Short" },
  { id: "pants", label: "Pantalón" },
  { id: "joggers", label: "Jogger" },
] as const;

const SHOES_PARTS: readonly PartOption[] = [
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

/**
 * Peinados que se OFRECEN por cuerpo (P7a): los que pasan el QA de cobertura en esa cabeza
 * (`components/avatar/assets.test.ts`). El mohicano no existe en el pack (era una cresta generada) y
 * el corto en F cae al rodete: siguen siendo ids válidos para los avatares guardados, pero no se ofrecen.
 */
const HAIR_OFFER: Record<BodyType, readonly string[]> = {
  male: ["none", "buzz", "short", "long", "bun"],
  female: ["none", "buzz", "long", "bun"],
};

export function hairOptionsFor(body: BodyType): readonly PartOption[] {
  return HAIR_PARTS.filter((p) => HAIR_OFFER[body].includes(p.id));
}

function partExists(category: PartCategory, id: string): boolean {
  return PARTS[category].some((p) => p.id === id);
}

/** Avatar por defecto al abrir el creador por primera vez. */
export const DEFAULT_AVATAR: AvatarConfig = {
  bodyType: "male",
  hair: { part: "short", color: "#3A2A20" },
  top: { part: "tee", color: "#A8352B" },
  bottom: { part: "shorts", color: "#1F2B47" },
  shoes: { part: "sneakers", color: "#ECE6D8" },
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
