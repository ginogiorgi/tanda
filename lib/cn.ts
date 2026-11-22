import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * `tailwind-merge` no conoce las utilidades PROPIAS de `app/globals.css`: por defecto tomaba `bg-halftone`
 * por un color de fondo y se comía al `bg-*` de color de al lado (feedback 4 #11: el cartel salía sin papel;
 * el placeholder 3D, sin fondo). Acá se las declara en su grupo real. Toda utilidad nueva de globals.css va acá
 * (`lib/cn.test.ts` lo verifica leyendo el CSS).
 */
export const CUSTOM_UTILITIES = {
  /** Imágenes de fondo (trama, cancha, rayados): conviven con un `bg-<color>`. */
  bgImage: ["bg-halftone", "bg-pitch", "bg-stripes-success", "bg-stripes-danger"],
  /** Sombras offset de la marca (`--shadow-*` de @theme). */
  shadow: ["card", "pop", "press"],
  /** En Tanda `font-mono` = cifras tabulares de la sans, NO una familia: convive con `font-display`/`font-sans`. */
  figures: ["font-mono"],
} as const;

const merge = extendTailwindMerge<"tanda-figures">({
  extend: {
    classGroups: {
      "bg-image": [...CUSTOM_UTILITIES.bgImage],
      shadow: [{ shadow: [...CUSTOM_UTILITIES.shadow] }],
      "tanda-figures": [...CUSTOM_UTILITIES.figures],
    },
  },
});

/**
 * Une clases condicionales y resuelve conflictos de Tailwind (la última gana).
 * Base de todas las primitivas de `components/ui/`.
 */
export function cn(...inputs: ClassValue[]): string {
  return merge(clsx(inputs));
}
