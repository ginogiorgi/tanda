"use client";

/**
 * Escena de penal 3D (R3F) — módulo **pesado** (trae three + fiber): se carga code-splitteado vía
 * `PenalSceneViewer` (nunca import estático desde una página/PenalLive). Ver SPEC §8.2.
 *
 * Fase 6: mini-estadio de día (`Stadium.tsx`), avatares ARTICULADOS animados con el rig propio
 * (`lib/avatar/rig.ts`: carrera + patada, arquero balanceándose y estirada direccional, festejo o
 * lamento), pelota con trayectoria determinista (`lib/penal/shot.ts`), red que se comba en el gol,
 * público que salta y cámara que acompaña la jugada y termina en el protagonista.
 *
 * Estados:
 *  - IDLE (sin `result`): pateador respirando detrás de la pelota, arquero balanceándose.
 *  - ANIMACIÓN (con `result`): `reason` + `variant` definen la jugada. Todo determinista → todos los
 *    clientes ven lo mismo. `anim.id` (penalty_id) reinicia el cronómetro una sola vez por penal.
 *  - Reduced motion: sin animación temporal; se muestra directo la pose final y el render es
 *    on-demand.
 */

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useCallback, useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { GlbAvatar } from "@/components/avatar/GlbAvatar";
import { applyPose, useRig } from "@/components/avatar/rigPose";
import {
  CELEBRATE,
  DEJECTED,
  KICKER_READY,
  KEEPER_READY,
  KICK,
  blendPose,
  samplePose,
  sequencePose,
  smoothstep,
} from "@/lib/avatar/rig";
import type { SceneRole } from "@/lib/penal/scene";
import { droneCamera, idleCamera } from "@/lib/penal/camera";
import { keeperClips, keeperPoseAt } from "@/lib/penal/keeper";
import { BALL_R, BALL_T0, BALL_T1, KEEPER_Z, SPOT, ballAt, netBulge, shotPlan } from "@/lib/penal/shot";
import type { PenaltyReason } from "@/lib/realtime/penal";
import { useBlobTexture } from "@/lib/three/blobTexture";
import { suppressThreeClockDeprecation } from "@/lib/three/suppress-clock-warning";
import { useReducedMotion } from "@/lib/useReducedMotion";
import { CROWD_GROUPS, Crowd, Goal, Pitch } from "./Stadium";

suppressThreeClockDeprecation(); // tarea 6: warning de THREE.Clock que emite R3F internamente

const SKY = "#d9d3c5";

/** `id` = penalty_id: identidad ESTABLE de la animación. El reset del cronómetro se keya por `id`
 * (no por identidad de objeto) → la animación corre UNA vez por penal, sin reinicios por re-render
 * del padre (B3.2). `reason`+`variant` definen la colocación (shotPlan). */
export type PenalAnimation = { id: string; reason: PenaltyReason; variant: number };

const KICKER_X = -0.095; // el pie derecho del pateador (mirando al arco) queda detrás de la pelota
const KICKER_Z0 = 1.3;
const KICKER_Z_CONTACT = 0.42;
const RESULT_REDUCED_T = 1000;
const IDLE_CAM = idleCamera(16 / 9); // reduced motion: t grande → todas las curvas quedan en su pose final


/** Pelota low-poly con gajos oscuros (colores por cara, sin texturas). */
function useBallGeometry(): THREE.BufferGeometry {
  return useMemo(() => {
    const g = new THREE.IcosahedronGeometry(BALL_R, 1); // ya es no-indexada (caras planas)
    const n = g.getAttribute("position").count;
    const col: number[] = [];
    const white = new THREE.Color("#f7f5ef");
    const dark = new THREE.Color("#141414");
    for (let f = 0; f < n / 3; f++) {
      const c = f % 4 === 0 ? dark : white;
      for (let k = 0; k < 3; k++) col.push(c.r, c.g, c.b);
    }
    g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    g.computeVertexNormals();
    return g;
  }, []);
}

function Actors({
  kicker,
  keeper,
  anim,
  reducedMotion,
  freezeAt,
}: {
  kicker: SceneRole;
  keeper: SceneRole;
  anim: PenalAnimation | null;
  reducedMotion: boolean;
  freezeAt?: number;
}) {
  const kickerGroup = useRef<THREE.Group>(null);
  const ballRef = useRef<THREE.Mesh>(null);
  const netRef = useRef<THREE.Group>(null);
  const shadows = useRef<(THREE.Mesh | null)[]>([]);
  const crowd = useRef<(THREE.Group | null)[]>([]);
  const kickerRig = useRig();
  const keeperRig = useRig();
  const startRef = useRef<number | null>(null);
  const invalidate = useThree((s) => s.invalidate);
  const blob = useBlobTexture("10,30,10", 0.5);
  const ballGeo = useBallGeometry();

  const plan = useMemo(() => (anim ? shotPlan(anim.reason, anim.variant) : null), [anim]);
  // Estirada armada para ESTA pelota (la mano llega a `plan.reach`); si ataja, se levanta festejando.
  const keeperAnim = useMemo(() => (plan ? keeperClips(plan) : null), [plan]);

  // Colores del público: las camisetas de los dos equipos (estables por valor, no por identidad).
  const crowdKey = [kicker.kitTop, kicker.kitSash, keeper.kitTop, keeper.kitSash].join("|");
  const crowdColors = useMemo(() => {
    const cs = crowdKey.split("|").filter((c) => c.startsWith("#"));
    return cs.length > 0 ? cs : ["#d7261e", "#1f3fa8"];
  }, [crowdKey]);

  const setCrowd = useCallback((i: number, g: THREE.Group | null) => {
    crowd.current[i] = g;
  }, []);

  // B3.2: reinicia el cronómetro SOLO cuando cambia el penal (identidad estable `anim.id`). Con
  // frameloop "demand" (reduced motion) además pedimos un frame para mostrar la pose final.
  useEffect(() => {
    startRef.current = null;
    invalidate();
  }, [anim?.id, invalidate]);

  useFrame((state) => {
    const clock = state.clock.elapsedTime;
    const ball = ballRef.current;
    const kg = kickerGroup.current;
    if (!ball || !kg) return;
    const idleT = reducedMotion ? 0 : clock;

    let t = -1;
    if (plan) {
      if (startRef.current == null) startRef.current = clock;
      t = freezeAt ?? (reducedMotion ? RESULT_REDUCED_T : clock - startRef.current);
    }

    // ── Pateador ──
    let kz = KICKER_Z0;
    if (!plan) {
      applyPose(kickerRig.handles.current, samplePose(KICKER_READY, idleT));
    } else {
      const idle = samplePose(KICKER_READY, 0);
      const action = (tt: number) => blendPose(idle, samplePose(KICK, tt), smoothstep(tt / 0.1));
      applyPose(kickerRig.handles.current, sequencePose(action, plan.reason === "goal" ? CELEBRATE : DEJECTED, t));
      kz =
        t < BALL_T0
          ? KICKER_Z0 + (KICKER_Z_CONTACT - KICKER_Z0) * smoothstep(t / BALL_T0)
          : KICKER_Z_CONTACT - 0.22 * smoothstep((t - BALL_T0) / 0.6);
    }
    kg.position.set(KICKER_X, 0, kz);

    // ── Arquero ──
    let keeperX = 0;
    let keeperZ = KEEPER_Z;
    let lying = 0;
    if (!plan) {
      const p = samplePose(KEEPER_READY, idleT);
      applyPose(keeperRig.handles.current, p);
      keeperX = p.root.x;
    } else if (keeperAnim) {
      const p = keeperPoseAt(plan, keeperAnim, t, idleT);
      applyPose(keeperRig.handles.current, p);
      keeperX = p.root.x;
      keeperZ = KEEPER_Z + p.root.z;
      lying = Math.min(1, Math.abs(p.root.rz) / 1.5);
    }

    // ── Pelota ──
    const bp = plan ? ballAt(plan, t) : SPOT;
    ball.position.set(bp[0], bp[1], bp[2]);
    if (plan && !reducedMotion && t > BALL_T0 && t < BALL_T1 + 0.6) {
      ball.rotation.x -= 0.35;
      ball.rotation.z += 0.12;
    }

    // ── Red y público ──
    const bulge = plan ? netBulge(plan, t) : 0;
    netRef.current?.scale.set(1, 1, 1 + bulge * 0.3);
    for (let i = 0; i < CROWD_GROUPS; i++) {
      const g = crowd.current[i];
      if (!g) continue;
      let y = reducedMotion ? 0 : Math.sin(clock * 1.6 + i * 2.1) * 0.015;
      if (plan?.reason === "goal" && !reducedMotion && t > BALL_T1) {
        const k = t - BALL_T1;
        y = Math.abs(Math.sin(k * 8 + i * 1.3)) * 0.2 * Math.max(0, 1 - k / 4);
      }
      g.position.y = y;
    }

    // ── Sombras de contacto ──
    const [sk, sg, sb] = shadows.current;
    sk?.position.set(KICKER_X, 0.01, kz);
    if (sg) {
      sg.position.set(keeperX, 0.01, keeperZ);
      sg.scale.set(1 + lying * 0.9, 1, 1);
    }
    if (sb) {
      sb.position.set(bp[0], 0.012, bp[2]);
      const s = Math.max(0.35, 1 - bp[1] / 3);
      sb.scale.set(s, s, 1);
    }

    // ── Cámara dron (lib/penal/camera.ts) ──
    const cam = state.camera;
    const shot = droneCamera(state.size.width / Math.max(1, state.size.height), plan, t, plan?.reason === "save" ? keeperX : bp[0]);
    cam.position.set(shot.pos[0], shot.pos[1], shot.pos[2]);
    cam.lookAt(shot.look[0], shot.look[1], shot.look[2]);
    if (cam instanceof THREE.PerspectiveCamera && cam.fov !== shot.fov) {
      cam.fov = shot.fov;
      cam.updateProjectionMatrix();
    }
  }, -1); // antes que el `useFrame` de `GlbAvatar` (traduce la pose a huesos en el mismo frame)

  return (
    <>
      <Goal netRef={netRef} />
      <Crowd colors={crowdColors} groupRefs={setCrowd} />

      <group ref={kickerGroup} position={[KICKER_X, 0, KICKER_Z0]} rotation={[0, Math.PI, 0]}>
        <GlbAvatar
          config={kicker.avatar}
          kitTop={kicker.kitTop ?? undefined}
          kitSash={kicker.kitSash ?? undefined}
          rig={kickerRig.register}
          grounded
        />
      </group>
      <group position={[0, 0, KEEPER_Z]}>
        <GlbAvatar
          config={keeper.avatar}
          kitTop={keeper.kitTop ?? undefined}
          kitSash={keeper.kitSash ?? undefined}
          rig={keeperRig.register}
          grounded
        />
      </group>
      <mesh ref={ballRef} position={[SPOT[0], SPOT[1], SPOT[2]]} geometry={ballGeo}>
        <meshStandardMaterial vertexColors flatShading />
      </mesh>

      {blob &&
        [0.9, 1.0, 0.36].map((size, i) => (
          <mesh
            key={i}
            ref={(m) => {
              shadows.current[i] = m;
            }}
            rotation={[-Math.PI / 2, 0, 0]}
          >
            <planeGeometry args={[size, size]} />
            <meshBasicMaterial map={blob} transparent depthWrite={false} />
          </mesh>
        ))}
    </>
  );
}

interface PenalSceneProps {
  kicker: SceneRole;
  keeper: SceneRole;
  /** Si viene, juega la animación del resultado (8.4/4.9); si no, escena idle. */
  result?: PenalAnimation | null;
  /** Solo dev (`/dev/penal`): congela la jugada en ese instante (s) para revisar cuadros. */
  freezeAt?: number;
}

export function PenalScene({ kicker, keeper, result = null, freezeAt }: PenalSceneProps) {
  const reducedMotion = useReducedMotion();
  // El 3D anima SOLO cuando hay algo que mirar: la jugada. Mientras se responde, la escena es un fondo
  // atenuado detrás de la tarjeta → se pinta a demanda (estática), como con reduced motion. Un loop a
  // 60 fps a pantalla completa le compite al hilo principal los taps de la respuesta (en un celu flojo
  // y con WebGL por software en el CI, los clicks no llegaban a procesarse).
  const live = result != null && !reducedMotion;
  return (
    <Canvas
      frameloop={live ? "always" : "demand"}
      dpr={[1, 1.75]}
      gl={{ antialias: true }}
      camera={{ fov: IDLE_CAM.fov, position: [IDLE_CAM.pos[0], IDLE_CAM.pos[1], IDLE_CAM.pos[2]] }}
    >
      <color attach="background" args={[SKY]} />
      <fog attach="fog" args={[SKY, 16, 34]} />
      <hemisphereLight args={["#fffaf0", "#3c8a41", 0.65]} />
      <directionalLight position={[4, 9, 5]} intensity={1.35} color="#fff3e0" />
      <directionalLight position={[-5, 3, -4]} intensity={0.35} color="#dfe6ff" />

      <Pitch />
      <Actors kicker={kicker} keeper={keeper} anim={result} reducedMotion={reducedMotion} freezeAt={freezeAt} />
    </Canvas>
  );
}
