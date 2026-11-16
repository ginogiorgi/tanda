/**
 * Paletas curadas del avatar (feedback 2, P7a.4) — por categoría, en clave "Programa" (papel/tinta,
 * tonos apagados). Gino delegó la decisión (14/11); se validan en la lámina de swatches de la galería
 * de QA (`/dev/avatar/qa?sheet=swatches`). Pelo sin colores de fantasía ("realistas").
 */
export interface Swatch {
  id: string;
  label: string;
  hex: string;
}

export const HAIR_PALETTE: readonly Swatch[] = [
  { id: "black", label: "Negro", hex: "#1E1B19" },
  { id: "dark-brown", label: "Castaño oscuro", hex: "#3A2A20" },
  { id: "brown", label: "Castaño", hex: "#5B3E2B" },
  { id: "light-brown", label: "Castaño claro", hex: "#80593B" },
  { id: "dark-blond", label: "Rubio oscuro", hex: "#A07D4E" },
  { id: "blond", label: "Rubio", hex: "#CFAE76" },
  { id: "red", label: "Colorado", hex: "#8C3F24" },
  { id: "grey", label: "Canoso", hex: "#A9A6A0" },
];

export const SKIN_PALETTE: readonly Swatch[] = [
  { id: "s1", label: "Muy clara", hex: "#F2D3BC" },
  { id: "s2", label: "Clara", hex: "#E0B593" },
  { id: "s3", label: "Media", hex: "#C68E66" },
  { id: "s4", label: "Morena", hex: "#A06B45" },
  { id: "s5", label: "Oscura", hex: "#764A2E" },
  { id: "s6", label: "Muy oscura", hex: "#4D3020" },
];

export const KIT_PALETTE: readonly Swatch[] = [
  { id: "ink", label: "Tinta", hex: "#1C1C1C" },
  { id: "raw", label: "Crudo", hex: "#ECE6D8" },
  { id: "cement", label: "Gris cemento", hex: "#8A8984" },
  { id: "navy", label: "Azul marino", hex: "#1F2B47" },
  { id: "club-blue", label: "Azul club", hex: "#2C4A9A" },
  { id: "sky", label: "Celeste lavado", hex: "#8FB2D3" },
  { id: "brick", label: "Rojo ladrillo", hex: "#A8352B" },
  { id: "maroon", label: "Bordó", hex: "#6B2433" },
  { id: "bottle", label: "Verde botella", hex: "#2E5A3C" },
  { id: "mustard", label: "Mostaza", hex: "#C4A042" },
];

export const BOOTS_PALETTE: readonly Swatch[] = [
  { id: "ink", label: "Tinta", hex: "#1C1C1C" },
  { id: "raw", label: "Crudo", hex: "#ECE6D8" },
  { id: "brick", label: "Rojo ladrillo", hex: "#A8352B" },
  { id: "club-blue", label: "Azul club", hex: "#2C4A9A" },
  { id: "mustard", label: "Mostaza", hex: "#C4A042" },
  { id: "cement", label: "Gris", hex: "#8A8984" },
];

/** sRGB hex → CIELAB (D65). */
export function hexToLab(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const [r, g, b] = [lin((n >> 16) & 255), lin((n >> 8) & 255), lin(n & 255)];
  const x = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047;
  const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883;
  const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
}

/** Delta-E CIE76 entre dos hex. */
export function deltaE(a: string, b: string): number {
  const [l1, a1, b1] = hexToLab(a);
  const [l2, a2, b2] = hexToLab(b);
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2);
}

/** El swatch de `palette` más cercano a `hex` (migración de colores viejos, P7b/P7c). */
export function nearestSwatch(palette: readonly Swatch[], hex: string): Swatch {
  let best = palette[0]!;
  let d = Infinity;
  for (const s of palette) {
    const e = deltaE(s.hex, hex);
    if (e < d) {
      d = e;
      best = s;
    }
  }
  return best;
}

/** Ropa que se lee "desnuda" contra esa piel (delta-E < 15): la tarjeta de paleta lo avisa. */
export const MIN_KIT_SKIN_DELTA_E = 15;
