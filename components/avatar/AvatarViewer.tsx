"use client";

/**
 * Punto de entrada para mostrar el avatar 3D desde cualquier vista. Code-splittea la escena
 * R3F (`AvatarCanvas`) con `next/dynamic` (`ssr: false`, three es solo cliente) para que el
 * bundle de three **no** entre en el resto de la app. Ver SPEC §8.2.
 */

import dynamic from "next/dynamic";
import type { AvatarConfig } from "@/lib/avatar/types";

const AvatarCanvas = dynamic(
  () => import("./AvatarCanvas").then((m) => m.AvatarCanvas),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full w-full items-center justify-center text-sm text-white/40">
        Cargando avatar…
      </div>
    ),
  },
);

interface AvatarViewerProps {
  config: AvatarConfig;
  rotationY?: number;
  className?: string;
}

export function AvatarViewer({ config, rotationY, className }: AvatarViewerProps) {
  return (
    <div className={className}>
      <AvatarCanvas config={config} rotationY={rotationY} />
    </div>
  );
}
