"use client";

/**
 * Escena R3F que muestra el avatar. Es el módulo **pesado** (trae three + fiber): se carga
 * code-splitteado vía `AvatarViewer` (nunca import estático desde una página). Ver SPEC §8.2.
 *
 * Fase 6: luz de estudio (key cálida + fill + rim de contorno), sombra de contacto (disco suave) y
 * el avatar respirando con el clip `IDLE` del rig. Con `prefers-reduced-motion` queda en reposo y el
 * canvas renderiza on-demand.
 */

import { Canvas, useFrame } from "@react-three/fiber";
import type { AvatarConfig } from "@/lib/avatar/types";
import { IDLE, REST, samplePose } from "@/lib/avatar/rig";
import { useReducedMotion } from "@/lib/useReducedMotion";
import { suppressThreeClockDeprecation } from "@/lib/three/suppress-clock-warning";
import { useBlobTexture } from "@/lib/three/blobTexture";
import { AvatarModel } from "./AvatarModel";
import { applyPose, useRig } from "./rigPose";

suppressThreeClockDeprecation(); // tarea 6: warning de THREE.Clock que emite R3F internamente

function AnimatedAvatar({ config, animate }: { config: AvatarConfig; animate: boolean }) {
  const { handles, register } = useRig();
  useFrame((state) => {
    applyPose(handles.current, animate ? samplePose(IDLE, state.clock.elapsedTime) : REST);
  });
  return <AvatarModel config={config} rig={register} />;
}

interface AvatarCanvasProps {
  config: AvatarConfig;
  /** Rotación en Y controlada (radianes). El creador la maneja con drag (tarea 2.4). */
  rotationY?: number;
}

export function AvatarCanvas({ config, rotationY = 0.4 }: AvatarCanvasProps) {
  const reducedMotion = useReducedMotion();
  const shadow = useBlobTexture();
  return (
    <Canvas
      frameloop={reducedMotion ? "demand" : "always"}
      camera={{ position: [0, 0, 3.8], fov: 35 }}
      dpr={[1, 2]}
      gl={{ antialias: true, alpha: true }}
    >
      <hemisphereLight args={["#fff6e8", "#b9b2a3", 0.55]} />
      {/* key cálida arriba-adelante, fill fría del otro lado y rim por detrás (contorno) */}
      <directionalLight position={[2.5, 4, 3]} intensity={1.35} color="#fff1dc" />
      <directionalLight position={[-3, 1.5, 2]} intensity={0.35} color="#dfe6ff" />
      <directionalLight position={[0, 3, -4]} intensity={0.9} color="#ffffff" />
      <group rotation={[0, rotationY, 0]}>
        <AnimatedAvatar config={config} animate={!reducedMotion} />
      </group>
      {shadow && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.925, 0]}>
          <planeGeometry args={[1.1, 1.1]} />
          <meshBasicMaterial map={shadow} transparent depthWrite={false} />
        </mesh>
      )}
    </Canvas>
  );
}
