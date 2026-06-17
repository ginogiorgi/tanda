"use client";

/**
 * Escena de penal 3D (R3F) — módulo **pesado** (trae three + fiber): se carga code-splitteado vía
 * `PenalSceneViewer` (nunca import estático desde una página/PenalLive). Ver SPEC §8.2.
 *
 * Composición "penal-cam clásica" (decisión de Gino): cámara detrás del pateador mirando al arco;
 * arquero de frente bajo los tres palos. Estática (poses idle): las animaciones procedurales por
 * causa (`goal`/`save`/`miss_wide`) son 8.4/4.9. Primitivas low-poly propias, sin GLBs.
 *
 * El pateador y el arquero son los avatares de los jugadores (`SceneRole`), con la camiseta teñida
 * por el `kit_primary` de su nación (`kitTop`). El resto del avatar va tal cual (§8.3 #1).
 */

import { Canvas } from "@react-three/fiber";
import { useThree } from "@react-three/fiber";
import { useEffect } from "react";
import { AvatarModel } from "@/components/avatar/AvatarModel";
import type { SceneRole } from "@/lib/penal/scene";

const GRASS = "#2f7d3a";
const GRASS_DARK = "#2a6f34";
const LINE = "#e8f5e9";
const POST = "#f4f4f4";

/** Centra la cámara una vez mirando al arco (setup, no animación por frame). */
function SceneCamera() {
  const camera = useThree((s) => s.camera);
  useEffect(() => {
    camera.position.set(0, 2.4, 3.4);
    camera.lookAt(0, 1.05, -6);
    camera.updateProjectionMatrix();
  }, [camera]);
  return null;
}

/** Arco low-poly: dos palos + travesaño + red tenue. Centrado en x=0, sobre la línea z=GOAL_Z. */
function Goal({ z, halfWidth, height }: { z: number; halfWidth: number; height: number }) {
  const r = 0.06;
  return (
    <group position={[0, 0, z]}>
      {[-halfWidth, halfWidth].map((x) => (
        <mesh key={x} position={[x, height / 2, 0]}>
          <cylinderGeometry args={[r, r, height, 6]} />
          <meshStandardMaterial color={POST} flatShading />
        </mesh>
      ))}
      <mesh position={[0, height, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[r, r, halfWidth * 2, 6]} />
        <meshStandardMaterial color={POST} flatShading />
      </mesh>
      {/* red: plano tenue detrás del arco */}
      <mesh position={[0, height / 2, -0.5]}>
        <planeGeometry args={[halfWidth * 2, height]} />
        <meshStandardMaterial color="#ffffff" transparent opacity={0.12} />
      </mesh>
    </group>
  );
}

/** Avatar parado con los pies sobre el césped (el modelo viene centrado en su origen). */
function StandingAvatar({
  role,
  position,
  rotationY,
}: {
  role: SceneRole;
  position: [number, number, number];
  rotationY: number;
}) {
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <AvatarModel config={role.avatar} kitTop={role.kitTop ?? undefined} />
    </group>
  );
}

interface PenalSceneProps {
  kicker: SceneRole;
  keeper: SceneRole;
}

const GOAL_Z = -7;

export function PenalScene({ kicker, keeper }: PenalSceneProps) {
  return (
    <Canvas dpr={[1, 2]} gl={{ antialias: true }} camera={{ fov: 42 }}>
      <SceneCamera />
      <color attach="background" args={["#0a0a0a"]} />
      <fog attach="fog" args={["#0a0a0a", 10, 22]} />
      <ambientLight intensity={0.7} />
      <directionalLight position={[3, 6, 4]} intensity={1.1} />
      <directionalLight position={[-4, 2, -3]} intensity={0.35} />

      {/* Césped */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, -2]} receiveShadow>
        <planeGeometry args={[24, 24]} />
        <meshStandardMaterial color={GRASS} flatShading />
      </mesh>
      {/* Punto de penal + línea del área (referencias 2D sobre el césped) */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
        <circleGeometry args={[0.1, 12]} />
        <meshStandardMaterial color={LINE} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.005, GOAL_Z + 0.4]}>
        <planeGeometry args={[10, 0.08]} />
        <meshStandardMaterial color={GRASS_DARK} />
      </mesh>

      <Goal z={GOAL_Z} halfWidth={1.8} height={2.0} />

      {/* Pelota low-poly */}
      <mesh position={[0, 0.12, 0]}>
        <icosahedronGeometry args={[0.12, 1]} />
        <meshStandardMaterial color="#fafafa" flatShading />
      </mesh>

      {/* Pateador: detrás de la pelota, de espaldas a la cámara (mira al arco) */}
      <StandingAvatar role={kicker} position={[0, 0.9, 1.3]} rotationY={Math.PI} />
      {/* Arquero: sobre la línea de gol, de frente (mira al pateador) */}
      <StandingAvatar role={keeper} position={[0, 0.86, GOAL_Z + 0.3]} rotationY={0} />
    </Canvas>
  );
}
