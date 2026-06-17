"use client";

/**
 * Escena de penal 3D (R3F) — módulo **pesado** (trae three + fiber): se carga code-splitteado vía
 * `PenalSceneViewer` (nunca import estático desde una página/PenalLive). Ver SPEC §8.2.
 *
 * Composición "penal-cam clásica" (decisión de Gino): cámara detrás del pateador mirando al arco;
 * arquero de frente bajo los tres palos. Primitivas low-poly propias, sin GLBs.
 *
 * Estados:
 *  - IDLE (sin `result`): poses estáticas, pateador detrás de la pelota, arquero en el arco.
 *  - ANIMACIÓN (con `result`, 8.4/4.9): al resolver se juega procedural según `reason` + `variant`
 *    (colocación por seed): `goal` (la pelota entra, el arquero vuela al lado equivocado), `save`
 *    (el arquero llega y la rechaza) o `miss_wide` (la pelota se va afuera/por arriba). Todo
 *    moviendo las primitivas por código (`useFrame`), sin rig importado.
 *
 * El pateador y el arquero son los avatares de los jugadores (`SceneRole`), con la camiseta teñida
 * por el `kit_primary` de su nación (`kitTop`). El resto del avatar va tal cual (§8.3 #1).
 */

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import type { Group, Mesh } from "three";
import { AvatarModel } from "@/components/avatar/AvatarModel";
import type { SceneRole } from "@/lib/penal/scene";
import type { PenaltyReason } from "@/lib/realtime/penal";
import { useReducedMotion } from "@/lib/useReducedMotion";

const GRASS = "#2f7d3a";
const GRASS_DARK = "#2a6f34";
const LINE = "#e8f5e9";
const POST = "#f4f4f4";

const GOAL_Z = -7;
const GOAL_HALF_W = 1.8;
const GOAL_H = 2.0;
const SPOT = { x: 0, y: 0.12, z: 0 } as const;

export type PenalAnimation = { reason: PenaltyReason; variant: number };

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

function Goal() {
  const r = 0.06;
  return (
    <group position={[0, 0, GOAL_Z]}>
      {[-GOAL_HALF_W, GOAL_HALF_W].map((x) => (
        <mesh key={x} position={[x, GOAL_H / 2, 0]}>
          <cylinderGeometry args={[r, r, GOAL_H, 6]} />
          <meshStandardMaterial color={POST} flatShading />
        </mesh>
      ))}
      <mesh position={[0, GOAL_H, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[r, r, GOAL_HALF_W * 2, 6]} />
        <meshStandardMaterial color={POST} flatShading />
      </mesh>
      <mesh position={[0, GOAL_H / 2, -0.5]}>
        <planeGeometry args={[GOAL_HALF_W * 2, GOAL_H]} />
        <meshStandardMaterial color="#ffffff" transparent opacity={0.12} />
      </mesh>
    </group>
  );
}

const easeOut = (t: number) => 1 - (1 - t) * (1 - t);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/**
 * Punto final de la pelota + dirección de la estirada del arquero, deterministas por reason+variant
 * (colocación: izq/der × bajo/alto). `keeperDir` es +1 (der) / -1 (izq) / 0 (centro).
 */
function shotPlan(anim: PenalAnimation): {
  ball: [number, number, number];
  keeperDir: number;
  caught: boolean;
} {
  const side = anim.variant % 2 === 0 ? -1 : 1; // izquierda / derecha
  const high = anim.variant >= 2;
  const cornerX = side * GOAL_HALF_W * 0.72;
  const lowY = 0.5;
  const highY = GOAL_H * 0.66;
  const y = high ? highY : lowY;

  switch (anim.reason) {
    case "goal":
      // Entra al ángulo; el arquero vuela al lado equivocado.
      return { ball: [cornerX, y, GOAL_Z + 0.25], keeperDir: -side, caught: false };
    case "save":
      // El arquero llega: la pelota se detiene en sus manos, un poco adelante del arco.
      return { ball: [side * 1.0, Math.max(0.5, y * 0.8), GOAL_Z + 0.7], keeperDir: side, caught: true };
    case "miss_wide":
    default:
      // Afuera: por fuera del palo o por arriba del travesaño.
      return {
        ball: [side * (GOAL_HALF_W + 0.9), high ? GOAL_H + 0.7 : 0.5, GOAL_Z + 0.1],
        keeperDir: side,
        caught: false,
      };
  }
}

/** Pateador, arquero y pelota; en IDLE quietos, con `anim` juegan el remate procedural. */
function Actors({
  kicker,
  keeper,
  anim,
  reducedMotion,
}: {
  kicker: SceneRole;
  keeper: SceneRole;
  anim: PenalAnimation | null;
  reducedMotion: boolean;
}) {
  const kickerRef = useRef<Group>(null);
  const keeperRef = useRef<Group>(null);
  const ballRef = useRef<Mesh>(null);
  const startRef = useRef<number | null>(null);

  const plan = useMemo(() => (anim ? shotPlan(anim) : null), [anim]);
  const keeperBaseX = 0;

  // Reinicia el cronómetro de la animación cuando llega un resultado nuevo.
  useEffect(() => {
    startRef.current = null;
  }, [anim]);

  useFrame((state) => {
    const ball = ballRef.current;
    const kk = kickerRef.current;
    const gk = keeperRef.current;
    if (!ball || !kk || !gk) return;

    if (!plan) {
      // IDLE: pelota en el punto, actores en pose base.
      ball.position.set(SPOT.x, SPOT.y, SPOT.z);
      kk.position.z = 1.3;
      kk.rotation.x = 0;
      gk.position.x = keeperBaseX;
      gk.position.y = 0.86;
      gk.rotation.z = 0;
      return;
    }

    if (startRef.current == null) startRef.current = state.clock.elapsedTime;
    // Reduced motion (9.3): saltamos la animación temporal y mostramos directo la pose final
    // (t grande → todas las interpolaciones quedan clampeadas a 1, sin trayectoria de la pelota
    // ni vuelo del arquero). El render queda estático.
    const t = reducedMotion ? 1000 : state.clock.elapsedTime - startRef.current;

    // ── Pateador: pasito de aproximación + plantada (0–0.35s) ──
    const approach = Math.min(1, t / 0.35);
    kk.position.z = lerp(1.6, 1.15, easeOut(approach));
    kk.rotation.x = -0.12 * easeOut(approach);

    // ── Pelota: vuela del punto al objetivo entre 0.3s y 1.45s, con arco ──
    const bp = Math.max(0, Math.min(1, (t - 0.3) / 1.15));
    const e = easeOut(bp);
    const arc = Math.sin(Math.PI * bp) * (plan.ball[1] > 1.2 ? 0.9 : 0.45);
    ball.position.x = lerp(SPOT.x, plan.ball[0], e);
    ball.position.y = lerp(SPOT.y, plan.ball[1], e) + arc;
    ball.position.z = lerp(SPOT.z, plan.ball[2], e);
    ball.rotation.x += 0.3;
    ball.rotation.y += 0.2;

    // ── Arquero: estirada entre 0.35s y 1.05s ──
    const dp = Math.max(0, Math.min(1, (t - 0.35) / 0.7));
    const de = easeOut(dp);
    gk.position.x = keeperBaseX + plan.keeperDir * 1.15 * de;
    gk.position.y = 0.86 + Math.sin(Math.PI * dp) * 0.35;
    gk.rotation.z = -plan.keeperDir * 0.9 * de;
  });

  return (
    <>
      <group ref={kickerRef} position={[0, 0.9, 1.3]} rotation={[0, Math.PI, 0]}>
        <AvatarModel config={kicker.avatar} kitTop={kicker.kitTop ?? undefined} />
      </group>
      <group ref={keeperRef} position={[0, 0.86, GOAL_Z + 0.3]}>
        <AvatarModel config={keeper.avatar} kitTop={keeper.kitTop ?? undefined} />
      </group>
      <mesh ref={ballRef} position={[SPOT.x, SPOT.y, SPOT.z]}>
        <icosahedronGeometry args={[0.12, 1]} />
        <meshStandardMaterial color="#fafafa" flatShading />
      </mesh>
    </>
  );
}

interface PenalSceneProps {
  kicker: SceneRole;
  keeper: SceneRole;
  /** Si viene, juega la animación del resultado (8.4/4.9); si no, escena idle. */
  result?: PenalAnimation | null;
}

export function PenalScene({ kicker, keeper, result = null }: PenalSceneProps) {
  const reducedMotion = useReducedMotion();
  // Perf: la escena es estática salvo durante la animación del remate → renderizamos on-demand
  // (no a 60fps continuos) en idle y con reduced motion; solo "always" mientras corre la animación.
  const frameloop = result && !reducedMotion ? "always" : "demand";
  return (
    <Canvas
      frameloop={frameloop}
      dpr={[1, 2]}
      gl={{ antialias: true }}
      camera={{ fov: 42 }}
    >
      <SceneCamera />
      <color attach="background" args={["#0a0a0a"]} />
      <fog attach="fog" args={["#0a0a0a", 10, 22]} />
      <ambientLight intensity={0.7} />
      <directionalLight position={[3, 6, 4]} intensity={1.1} />
      <directionalLight position={[-4, 2, -3]} intensity={0.35} />

      {/* Césped */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, -2]}>
        <planeGeometry args={[24, 24]} />
        <meshStandardMaterial color={GRASS} flatShading />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
        <circleGeometry args={[0.1, 12]} />
        <meshStandardMaterial color={LINE} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.005, GOAL_Z + 0.4]}>
        <planeGeometry args={[10, 0.08]} />
        <meshStandardMaterial color={GRASS_DARK} />
      </mesh>

      <Goal />
      <Actors kicker={kicker} keeper={keeper} anim={result} reducedMotion={reducedMotion} />
    </Canvas>
  );
}
