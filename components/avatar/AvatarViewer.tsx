"use client";

/**
 * Punto de entrada para mostrar el avatar 3D desde cualquier vista. Code-splittea la escena R3F
 * (`AvatarCanvas`) con `next/dynamic` (`ssr: false`, three es solo cliente) para que el bundle de three
 * **no** entre en el resto de la app. Ver SPEC §8.2.
 *
 * El canvas se monta recién con los dos GLB cargados (el creador cambia de cuerpo sin esperar): mientras
 * tanto un placeholder neutro y, si falla, error con reintento (feedback 2, P2.1).
 */

import dynamic from "next/dynamic";
import type { AvatarConfig, BodyType } from "@/lib/avatar/types";
import { Scene3DError, Scene3DSkeleton } from "./Scene3DStatus";
import { useGlbReady } from "./useGlbReady";

const AvatarCanvas = dynamic(() => import("./AvatarCanvas").then((m) => m.AvatarCanvas), {
  ssr: false,
  loading: () => <Scene3DSkeleton label="Cargando tu jugador" />,
});

const BOTH: readonly BodyType[] = ["male", "female"];

interface AvatarViewerProps {
  config: AvatarConfig;
  rotationY?: number;
  className?: string;
}

export function AvatarViewer({ config, rotationY, className }: AvatarViewerProps) {
  const { status, retry } = useGlbReady(BOTH);
  return (
    <div className={className}>
      {status === "ready" ? (
        <AvatarCanvas config={config} rotationY={rotationY} />
      ) : status === "error" ? (
        <Scene3DError onRetry={retry} />
      ) : (
        <Scene3DSkeleton label="Cargando tu jugador" />
      )}
    </div>
  );
}
