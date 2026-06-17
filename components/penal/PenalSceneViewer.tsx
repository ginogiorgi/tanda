"use client";

/**
 * Punto de entrada de la escena de penal 3D. Code-splittea la escena R3F (`PenalScene`) con
 * `next/dynamic` (`ssr: false`, three es solo cliente) para que el bundle de three **no** entre en
 * el resto de la app. Espejo de `components/avatar/AvatarViewer.tsx`. Ver SPEC §8.2.
 */

import dynamic from "next/dynamic";
import type { SceneRole } from "@/lib/penal/scene";

const PenalScene = dynamic(
  () => import("./PenalScene").then((m) => m.PenalScene),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full w-full items-center justify-center text-sm text-fg-subtle">
        Cargando cancha…
      </div>
    ),
  },
);

interface PenalSceneViewerProps {
  kicker: SceneRole;
  keeper: SceneRole;
  className?: string;
}

export function PenalSceneViewer({ kicker, keeper, className }: PenalSceneViewerProps) {
  return (
    <div className={className}>
      <PenalScene kicker={kicker} keeper={keeper} />
    </div>
  );
}
