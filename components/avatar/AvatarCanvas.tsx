"use client";

/**
 * Escena R3F que muestra el avatar. Es el módulo **pesado** (trae three + fiber): se carga
 * code-splitteado vía `AvatarViewer` (nunca import estático desde una página). Ver SPEC §8.2.
 *
 * Fase 6: luz de estudio (key cálida + fill + rim de contorno), sombra de contacto (disco suave) y
 * el avatar respirando con el clip `IDLE` del rig. Con `prefers-reduced-motion` queda en reposo y el
 * canvas renderiza on-demand.
 */

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useLayoutEffect } from "react";
import * as THREE from "three";
import type { AvatarV2 } from "@/lib/avatar/schema";
import { IDLE, REST, samplePose } from "@/lib/avatar/rig";
import { useReducedMotion } from "@/lib/useReducedMotion";
import { suppressThreeClockDeprecation } from "@/lib/three/suppress-clock-warning";
import { useBlobTexture } from "@/lib/three/blobTexture";
import { GlbAvatar } from "./GlbAvatar";
import { applyPose, useRig } from "./rigPose";

suppressThreeClockDeprecation(); // tarea 6: warning de THREE.Clock que emite R3F internamente

function AnimatedAvatar({ config, animate }: { config: AvatarV2; animate: boolean }) {
  const { handles, register } = useRig();
  // Prioridad -1: la pose se aplica antes de que `GlbAvatar` la traduzca a huesos (mismo frame).
  useFrame((state) => {
    applyPose(handles.current, animate ? samplePose(IDLE, state.clock.elapsedTime) : REST);
  }, -1);
  return <GlbAvatar config={config} rig={register} />;
}

/** Foco de cámara del creador (P7d): cuerpo entero, cabeza (pelo/piel) o pies (botines). */
export type AvatarFocus = "body" | "head" | "feet";

/** Avatar centrado: pies en y≈-0.92, cabeza ≈0.72. Posición de cámara y objetivo por foco. */
const FOCUS: Record<AvatarFocus, { pos: THREE.Vector3; target: THREE.Vector3 }> = {
  body: { pos: new THREE.Vector3(0, 0, 3.8), target: new THREE.Vector3(0, 0, 0) },
  head: { pos: new THREE.Vector3(0, 0.74, 1.45), target: new THREE.Vector3(0, 0.7, 0) },
  feet: { pos: new THREE.Vector3(0, -0.62, 1.3), target: new THREE.Vector3(0, -0.86, 0) },
};

const tmpPos = new THREE.Vector3();
const lookAt = new THREE.Vector3();

/** Lleva la cámara al foco (lerp por frame; con reduced motion, corte directo). `zoom` acerca/aleja. */
function CameraRig({ focus, zoom, animate }: { focus: AvatarFocus; zoom: number; animate: boolean }) {
  const camera = useThree((s) => s.camera);
  const invalidate = useThree((s) => s.invalidate);
  const goal = FOCUS[focus];
  const place = (t: number) => {
    tmpPos.copy(goal.pos).sub(goal.target).multiplyScalar(zoom).add(goal.target);
    camera.position.lerp(tmpPos, t);
    lookAt.lerp(goal.target, t);
    camera.lookAt(lookAt);
  };
  useLayoutEffect(() => {
    if (animate) return;
    place(1);
    invalidate();
  });
  useFrame((_, dt) => {
    if (animate) place(1 - Math.exp(-dt * 6));
  });
  return null;
}

interface AvatarCanvasProps {
  config: AvatarV2;
  /** Rotación en Y controlada (radianes). El creador la maneja con drag (tarea 2.4). */
  rotationY?: number;
  focus?: AvatarFocus;
  /** Multiplica la distancia de la cámara al foco (pinch/rueda del creador). */
  zoom?: number;
}

export function AvatarCanvas({ config, rotationY = 0.4, focus = "body", zoom = 1 }: AvatarCanvasProps) {
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
      <CameraRig focus={focus} zoom={zoom} animate={!reducedMotion} />
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
