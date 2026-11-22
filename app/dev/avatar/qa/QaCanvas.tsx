"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { useRef, useState } from "react";
import * as THREE from "three";
import type { AvatarV2 } from "@/lib/avatar/schema";
import { CELEBRATE, KICK, KICKER_READY, keeperDive, samplePose, type Clip } from "@/lib/avatar/rig";
import { GlbAvatar } from "@/components/avatar/GlbAvatar";
import { applyPose, useRig } from "@/components/avatar/rigPose";
import { CELEBRATIONS, isCelebrationId } from "@/lib/avatar/celebrations";

/** Pose clave → (clip, instante). */
const POSES: Record<string, readonly [Clip, number]> = {
  ready: [KICKER_READY, 0],
  kick: [KICK, 0.45],
  dive: [keeperDive({ x: 1.5, y: 0.55, z: 0.25 }), 0.75],
  celebrate: [CELEBRATE, 1.2],
};

/** Vista → posición de cámara y objetivo (avatar con los pies en y=0, 1,85 m). */
const VIEWS: Record<string, { pos: [number, number, number]; target: [number, number, number]; fov: number }> = {
  front: { pos: [0, 1.0, 4.2], target: [0, 0.95, 0], fov: 32 },
  q34: { pos: [2.9, 1.1, 3.0], target: [0, 0.95, 0], fov: 32 },
  side: { pos: [4.2, 1.0, 0], target: [0, 0.95, 0], fov: 32 },
  back: { pos: [0, 1.0, -4.2], target: [0, 0.95, 0], fov: 32 },
  head: { pos: [0.5, 1.75, 1.1], target: [0, 1.65, 0], fov: 30 },
  top: { pos: [0.01, 2.9, 0.35], target: [0, 1.65, 0], fov: 30 },
  headback: { pos: [-0.5, 1.75, -1.1], target: [0, 1.65, 0], fov: 30 },
  headside: { pos: [1.25, 1.68, -0.05], target: [0, 1.6, -0.05], fov: 30 },
  feet: { pos: [0.25, 0.25, 0.9], target: [0, 0.06, 0.05], fov: 35 },
  low: { pos: [0.3, 0.02, 0.7], target: [0, 0.1, 0], fov: 40 },
  /** Festejos (feedback 4 #16): de frente y abierta (el rodillazo se acerca 1,6 m) y "dron" (≈49° como el juego, más cerca). */
  wide: { pos: [0, 1.5, 6.2], target: [0, 0.85, 0.8], fov: 38 },
  wideq34: { pos: [4.0, 1.6, 5.0], target: [0, 0.85, 0.8], fov: 38 },
  drone: { pos: [0, 4.6, 4.6], target: [0, 0.5, 0.4], fov: 42 },
};

/** `cel-<id>` + `t` → festejo en ese instante; el resto, las poses clave fijas. */
function clipFor(pose: string, t: number | null): readonly [Clip, number] {
  const cel = pose.startsWith("cel-") ? pose.slice(4) : null;
  if (cel && isCelebrationId(cel)) return [CELEBRATIONS[cel], t ?? CELEBRATIONS[cel].duration];
  return POSES[pose] ?? POSES.ready!;
}

function Posed({ config, pose, t: at, onReady }: { config: AvatarV2; pose: string; t: number | null; onReady: () => void }) {
  const { handles, register } = useRig();
  const [clip, t] = clipFor(pose, at);
  // Los festejos se miran como en el juego: el pateador de espaldas (mirando al arco) que gira hacia la cámara.
  const flip = pose.startsWith("cel-");
  const frames = useRef(0);
  useFrame(() => {
    applyPose(handles.current, samplePose(clip, t));
    if (++frames.current === 3) onReady();
  }, -1);
  return (
    <group rotation={[0, flip ? Math.PI : 0, 0]}>
      <GlbAvatar config={config} rig={register} grounded />
    </group>
  );
}

/** Canvas determinista de la galería: DPR 1, 768×768, luz de estudio fija, sin animación. */
export function QaCanvas({ config, view, pose, t = null }: { config: AvatarV2; view: string; pose: string; t?: number | null }) {
  const [ready, setReady] = useState(false);
  const v = VIEWS[view] ?? VIEWS.front!;
  return (
    <div data-qa-ready={ready ? "1" : "0"} className="size-[768px]">
      <Canvas
        dpr={1}
        gl={{ antialias: true, preserveDrawingBuffer: true }}
        camera={{ fov: v.fov, position: v.pos }}
        onCreated={({ camera }) => camera.lookAt(new THREE.Vector3(...v.target))}
      >
        <color attach="background" args={["#d9d4c7"]} />
        <hemisphereLight args={["#fff6e8", "#b9b2a3", 0.6]} />
        <directionalLight position={[2.5, 4, 3]} intensity={1.35} color="#fff1dc" />
        <directionalLight position={[-3, 1.5, 2]} intensity={0.4} color="#dfe6ff" />
        <directionalLight position={[0, 3, -4]} intensity={0.9} color="#ffffff" />
        <Posed config={config} pose={pose} t={t} onReady={() => setReady(true)} />
      </Canvas>
    </div>
  );
}
