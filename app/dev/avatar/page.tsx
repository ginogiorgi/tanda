import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { AvatarViewer } from "@/components/avatar/AvatarViewer";
import type { AvatarV2 } from "@/lib/avatar/schema";

export const metadata: Metadata = { robots: { index: false, follow: false } };

const av = (body: AvatarV2["body"], skin: string, style: AvatarV2["hair"]["style"], hair: string, shirt: string, shorts: string, boots: string): AvatarV2 => ({
  v: 2,
  body,
  skin,
  hair: { style, color: hair },
  kit: { shirt, shorts },
  boots: { color: boots },
});

/** Combinaciones que cubren peinados, pieles y cuerpos (≤8 canvas WebGL). */
const VARIANTS: readonly { label: string; config: AvatarV2; rotationY?: number }[] = [
  { label: "Hombre · corto · morena", config: av("male", "#A06B45", "parted", "#3A2A20", "#8FB2D3", "#1C1C1C", "#1C1C1C") },
  { label: "Mujer · rodete · muy clara", config: av("female", "#F2D3BC", "bun", "#CFAE76", "#2C4A9A", "#ECE6D8", "#A8352B") },
  { label: "Hombre · rapado · muy oscura", config: av("male", "#4D3020", "buzz", "#1E1B19", "#A8352B", "#1F2B47", "#ECE6D8") },
  { label: "Mujer · largo · media", config: av("female", "#C68E66", "long", "#8C3F24", "#C4A042", "#1C1C1C", "#1C1C1C") },
  { label: "Hombre · largo · clara (perfil)", config: av("male", "#E0B593", "long", "#A07D4E", "#1C1C1C", "#ECE6D8", "#C4A042"), rotationY: 1.2 },
  { label: "Mujer · rapado · oscura", config: av("female", "#764A2E", "buzz", "#1E1B19", "#ECE6D8", "#6B2433", "#2C4A9A") },
  { label: "Hombre · pelado · media", config: av("male", "#C68E66", "none", "#1E1B19", "#2E5A3C", "#ECE6D8", "#8A8984") },
  { label: "Hombre · rodete · canoso", config: av("male", "#E0B593", "bun", "#A9A6A0", "#6B2433", "#1C1C1C", "#1C1C1C") },
];

/** Galería del avatar GLB (Fase 6b): todas las piezas de un vistazo. 404 en producción. */
export default function AvatarDevPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <main className="mx-auto grid max-w-6xl grid-cols-2 gap-3 p-4 sm:grid-cols-4">
      {VARIANTS.map((v) => (
        <figure key={v.label} className="flex flex-col gap-1 border-2 border-ink bg-bg-elevated shadow-card">
          <AvatarViewer config={v.config} rotationY={v.rotationY} className="aspect-[3/4] w-full" />
          <figcaption className="px-2 pb-2 font-sans text-xs text-fg">{v.label}</figcaption>
        </figure>
      ))}
    </main>
  );
}
