"use client";

/**
 * Punto de entrada de la escena de penal 3D. Code-splittea la escena R3F (`PenalScene`) con
 * `next/dynamic` (`ssr: false`, three es solo cliente) para que el bundle de three **no** entre en
 * el resto de la app. Espejo de `components/avatar/AvatarViewer.tsx`. Ver SPEC §8.2.
 *
 * La escena se monta recién con los GLB de los dos jugadores cargados (feedback 2, P2.1): mientras
 * tanto un placeholder neutro (la pregunta NO espera al 3D: es decorativo) y si falla, error con
 * reintento; el penal se juega igual.
 */

import dynamic from "next/dynamic";
import { Scene3DError, Scene3DSkeleton } from "@/components/avatar/Scene3DStatus";
import { useGlbReady } from "@/components/avatar/useGlbReady";
import type { SceneRole } from "@/lib/penal/scene";
import type { PenalAnimation } from "./PenalScene";

const PenalScene = dynamic(() => import("./PenalScene").then((m) => m.PenalScene), {
  ssr: false,
  loading: () => <Scene3DSkeleton className="bg-scene-sky" />,
});

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
  const { status, retry } = useGlbReady([kicker.avatar.body, keeper.avatar.body]);
  return (
    <div className={className}>
      {status === "ready" ? (
        <PenalScene kicker={kicker} keeper={keeper} result={result} freezeAt={freezeAt} />
      ) : status === "error" ? (
        <Scene3DError onRetry={retry} />
      ) : (
        <Scene3DSkeleton className="bg-scene-sky" />
      )}
    </div>
  );
}
