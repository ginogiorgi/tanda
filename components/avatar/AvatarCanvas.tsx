"use client";

/**
 * Escena R3F que muestra el avatar. Es el módulo **pesado** (trae three + fiber): se carga
 * code-splitteado vía `AvatarViewer` (nunca import estático desde una página). Ver SPEC §8.2.
 */

import { Canvas } from "@react-three/fiber";
import type { AvatarConfig } from "@/lib/avatar/types";
import { AvatarModel } from "./AvatarModel";

interface AvatarCanvasProps {
  config: AvatarConfig;
  /** Rotación en Y controlada (radianes). El creador la maneja con drag (tarea 2.4). */
  rotationY?: number;
}

export function AvatarCanvas({ config, rotationY = 0.4 }: AvatarCanvasProps) {
  return (
    <Canvas
      camera={{ position: [0, 0, 3.8], fov: 35 }}
      dpr={[1, 2]}
      gl={{ antialias: true, alpha: true }}
    >
      <ambientLight intensity={0.7} />
      <directionalLight position={[2.5, 4, 2]} intensity={1.1} />
      <directionalLight position={[-3, 1, -2]} intensity={0.3} />
      <group rotation={[0, rotationY, 0]}>
        <AvatarModel config={config} />
      </group>
    </Canvas>
  );
}
