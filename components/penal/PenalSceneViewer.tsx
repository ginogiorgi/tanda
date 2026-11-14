"use client";

/**
 * Punto de entrada de la escena de penal 3D. Code-splittea la escena R3F (`PenalScene`) con
 * `next/dynamic` (`ssr: false`, three es solo cliente) para que el bundle de three **no** entre en
 * el resto de la app. Espejo de `components/avatar/AvatarViewer.tsx`. Ver SPEC §8.2.
 */

import dynamic from "next/dynamic";
import type { SceneRole } from "@/lib/penal/scene";
import type { PenalAnimation } from "./PenalScene";

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
  /** Animación del resultado (8.4/4.9); null/ausente = escena idle. */
  result?: PenalAnimation | null;
  className?: string;
  /** Solo dev: congela la jugada (ver `PenalScene`). */
  freezeAt?: number;
}

export function PenalSceneViewer({ kicker, keeper, result, className, freezeAt }: PenalSceneViewerProps) {
  return (
    <div className={className}>
      <PenalScene kicker={kicker} keeper={keeper} result={result} freezeAt={freezeAt} />
    </div>
  );
}
