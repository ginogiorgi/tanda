import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { AvatarViewer } from "@/components/avatar/AvatarViewer";
import type { AvatarConfig } from "@/lib/avatar/types";

export const metadata: Metadata = { robots: { index: false, follow: false } };

/** Combinaciones que cubren todos los peinados, cortes de ropa y cuerpos (≤8 canvas WebGL). */
const VARIANTS: readonly { label: string; config: AvatarConfig; rotationY?: number }[] = [
  {
    label: "Hombre · corto · remera · short",
    config: { bodyType: "male", hair: { part: "short", color: "#2b1d14" }, top: { part: "tee", color: "#75aadb" }, bottom: { part: "shorts", color: "#141414" }, shoes: { part: "cleats", color: "#d7261e" } },
  },
  {
    label: "Mujer · rodete · manga larga · pantalón",
    config: { bodyType: "female", hair: { part: "bun", color: "#c58b4a" }, top: { part: "longsleeve", color: "#1f3fa8" }, bottom: { part: "pants", color: "#3b3b3b" }, shoes: { part: "boots", color: "#141414" } },
  },
  {
    label: "Hombre · rapado · musculosa · jogger",
    config: { bodyType: "male", hair: { part: "buzz", color: "#141414" }, top: { part: "tank", color: "#d7261e" }, bottom: { part: "joggers", color: "#1f3fa8" }, shoes: { part: "sneakers", color: "#ede9df" } },
  },
  {
    label: "Mujer · largo · remera · short",
    config: { bodyType: "female", hair: { part: "long", color: "#6b3e1e" }, top: { part: "tee", color: "#f2c230" }, bottom: { part: "shorts", color: "#141414" }, shoes: { part: "cleats", color: "#141414" } },
  },
  {
    label: "Hombre · mohicano · manga larga · pantalón (perfil)",
    config: { bodyType: "male", hair: { part: "mohawk", color: "#d7261e" }, top: { part: "longsleeve", color: "#141414" }, bottom: { part: "pants", color: "#ede9df" }, shoes: { part: "boots", color: "#d7261e" } },
    rotationY: 1.2,
  },
  {
    label: "Mujer · rapado · musculosa · jogger",
    config: { bodyType: "female", hair: { part: "buzz", color: "#e8d8b0" }, top: { part: "tank", color: "#ede9df" }, bottom: { part: "joggers", color: "#141414" }, shoes: { part: "sneakers", color: "#1f3fa8" } },
  },
  {
    label: "Hombre · pelado",
    config: { bodyType: "male", hair: { part: "none", color: "#141414" }, top: { part: "tee", color: "#ede9df" }, bottom: { part: "shorts", color: "#1f3fa8" }, shoes: { part: "cleats", color: "#141414" } },
  },
  {
    label: "Mujer · mohicano · remera · short",
    config: { bodyType: "female", hair: { part: "mohawk", color: "#1f3fa8" }, top: { part: "tee", color: "#141414" }, bottom: { part: "shorts", color: "#d7261e" }, shoes: { part: "cleats", color: "#ede9df" } },
  },
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
