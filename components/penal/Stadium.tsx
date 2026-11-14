"use client";

/**
 * Mini-estadio low-poly de la escena de penal (Fase 6). Todo estático y armado en `useMemo` (sin
 * efectos): césped a franjas, líneas del área, arco con red, carteles y tribuna con público. El
 * público es UNA sola malla por fila-grupo (geometría fusionada con colores por vértice) → pocas
 * draw calls aunque haya cientos de hinchas. Los colores salen de las camisetas de los dos equipos.
 *
 * Expone refs para que la escena anime la red (comba en el gol) y el público (salta en el gol).
 */

import { useMemo, type Ref } from "react";
import * as THREE from "three";
import { GOAL_H, GOAL_HALF_W, GOAL_Z } from "@/lib/penal/shot";

const NET_DEPTH = 0.95;

const GRASS_A = "#3c8a41";
const GRASS_B = "#347c39";
const LINE = "#f2efe6";
const POST = "#f7f5ef";
// Marca "Programa": rojo de imprenta, azul, tinta y papel en los carteles.
const BOARDS = ["#d7261e", "#141414", "#1f3fa8", "#ede9df"] as const;
const STAND = "#4a4740";
const STAND_STEP = "#5a564d";
const NEUTRALS = ["#ede9df", "#141414", "#8c8579", "#c9c2b4", "#d7261e", "#1f3fa8"] as const;

/** RNG chico y determinista (mulberry32): el público sale igual en cada render. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function Grass() {
  const stripes = useMemo(() => {
    const out: { z: number; color: string }[] = [];
    for (let i = 0; i < 14; i++) out.push({ z: 6 - i * 1.5, color: i % 2 === 0 ? GRASS_A : GRASS_B });
    return out;
  }, []);
  return (
    <group>
      {stripes.map((s) => (
        <mesh key={s.z} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, s.z - 0.75]}>
          <planeGeometry args={[34, 1.5]} />
          <meshStandardMaterial color={s.color} />
        </mesh>
      ))}
    </group>
  );
}

/** Línea de cal: un plano finito apoyado en el césped entre dos puntos (x,z). */
function Line({ from, to }: { from: [number, number]; to: [number, number] }) {
  const dx = to[0] - from[0];
  const dz = to[1] - from[1];
  const len = Math.hypot(dx, dz);
  return (
    <mesh
      rotation={[-Math.PI / 2, 0, -Math.atan2(dz, dx)]}
      position={[(from[0] + to[0]) / 2, 0.006, (from[1] + to[1]) / 2]}
    >
      <planeGeometry args={[len, 0.06]} />
      <meshBasicMaterial color={LINE} />
    </mesh>
  );
}

function PitchLines() {
  const six = { hw: 3.4, front: GOAL_Z + 2.2 };
  const box = { hw: 8.5, front: 3.5 };
  return (
    <group>
      <Line from={[-16, GOAL_Z]} to={[16, GOAL_Z]} />
      <Line from={[-six.hw, GOAL_Z]} to={[-six.hw, six.front]} />
      <Line from={[six.hw, GOAL_Z]} to={[six.hw, six.front]} />
      <Line from={[-six.hw, six.front]} to={[six.hw, six.front]} />
      <Line from={[-box.hw, GOAL_Z]} to={[-box.hw, box.front]} />
      <Line from={[box.hw, GOAL_Z]} to={[box.hw, box.front]} />
      {/* punto del penal */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.007, 0]}>
        <circleGeometry args={[0.11, 14]} />
        <meshBasicMaterial color={LINE} />
      </mesh>
    </group>
  );
}

/** Red: cuadrícula de segmentos (fondo, techo y laterales). Coordenadas relativas a la línea de gol. */
function useNetGeometry(): THREE.BufferGeometry {
  return useMemo(() => {
    const p: number[] = [];
    const seg = (a: [number, number, number], b: [number, number, number]) => p.push(...a, ...b);
    const step = 0.16;
    const backH = GOAL_H * 0.9;
    const W = GOAL_HALF_W;
    const D = -NET_DEPTH;
    // fondo
    for (let x = -W; x <= W + 1e-6; x += step) seg([x, 0, D], [x, backH, D]);
    for (let y = 0; y <= backH + 1e-6; y += step) seg([-W, y, D], [W, y, D]);
    // techo (del travesaño al borde superior del fondo)
    for (let x = -W; x <= W + 1e-6; x += step) seg([x, GOAL_H, 0], [x, backH, D]);
    for (let k = 0; k <= 1 + 1e-6; k += step / NET_DEPTH) seg([-W, GOAL_H + (backH - GOAL_H) * k, D * k], [W, GOAL_H + (backH - GOAL_H) * k, D * k]);
    // laterales
    for (const sx of [-W, W]) {
      for (let k = 0; k <= 1 + 1e-6; k += step / NET_DEPTH) seg([sx, 0, D * k], [sx, GOAL_H + (backH - GOAL_H) * k, D * k]);
      for (let y = 0; y <= backH + 1e-6; y += step) seg([sx, y, 0], [sx, Math.min(y, backH), D]);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(p, 3));
    return g;
  }, []);
}

export function Goal({ netRef }: { netRef: Ref<THREE.Group> }) {
  const net = useNetGeometry();
  const r = 0.06;
  return (
    <group position={[0, 0, GOAL_Z]}>
      {[-GOAL_HALF_W, GOAL_HALF_W].map((x) => (
        <mesh key={x} position={[x, GOAL_H / 2, 0]}>
          <cylinderGeometry args={[r, r, GOAL_H, 8]} />
          <meshStandardMaterial color={POST} />
        </mesh>
      ))}
      <mesh position={[0, GOAL_H, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[r, r, GOAL_HALF_W * 2 + r * 2, 8]} />
        <meshStandardMaterial color={POST} />
      </mesh>
      <group ref={netRef}>
        <lineSegments geometry={net}>
          <lineBasicMaterial color="#ffffff" transparent opacity={0.6} />
        </lineSegments>
      </group>
    </group>
  );
}

function Boards() {
  const z = GOAL_Z - 2.6;
  const segs = useMemo(() => Array.from({ length: 10 }, (_, i) => ({ x: -13.5 + i * 3, color: BOARDS[i % BOARDS.length]! })), []);
  return (
    <group>
      {segs.map((s) => (
        <mesh key={s.x} position={[s.x, 0.3, z]}>
          <boxGeometry args={[2.96, 0.6, 0.08]} />
          <meshStandardMaterial color={s.color} />
        </mesh>
      ))}
    </group>
  );
}

const ROWS = 9;
const ROW_DEPTH = 0.6;
const ROW_RISE = 0.42;
const STAND_Z0 = GOAL_Z - 3.6;
export const CROWD_GROUPS = 3;

/** Público fusionado en `CROWD_GROUPS` mallas (filas intercaladas → saltan desfasadas). */
function useCrowdGeometries(colors: readonly string[]): THREE.BufferGeometry[] {
  return useMemo(() => {
    const rand = rng(20261113);
    const body = new THREE.BoxGeometry(0.3, 0.42, 0.24).toNonIndexed();
    const head = new THREE.BoxGeometry(0.17, 0.17, 0.17).toNonIndexed();
    const skinTones = ["#e0b08a", "#c68a5e", "#8d5a3a", "#f1c9a5"];
    const out: { pos: number[]; col: number[] }[] = Array.from({ length: CROWD_GROUPS }, () => ({ pos: [], col: [] }));
    const c = new THREE.Color();
    const push = (target: { pos: number[]; col: number[] }, geo: THREE.BufferGeometry, ox: number, oy: number, oz: number, hex: string) => {
      const a = geo.getAttribute("position");
      c.set(hex);
      for (let i = 0; i < a.count; i++) {
        target.pos.push(a.getX(i) + ox, a.getY(i) + oy, a.getZ(i) + oz);
        target.col.push(c.r, c.g, c.b);
      }
    };
    for (let row = 0; row < ROWS; row++) {
      const z = STAND_Z0 - row * ROW_DEPTH;
      const y = 0.5 + row * ROW_RISE;
      const target = out[row % CROWD_GROUPS]!;
      for (let x = -15; x <= 15; x += 0.42) {
        if (rand() < 0.12) continue; // asientos vacíos → textura menos uniforme
        const jx = x + (rand() - 0.5) * 0.12;
        const shirt = rand() < 0.72 ? colors[Math.floor(rand() * colors.length)]! : NEUTRALS[Math.floor(rand() * NEUTRALS.length)]!;
        push(target, body, jx, y + 0.21, z, shirt);
        push(target, head, jx, y + 0.52, z, skinTones[Math.floor(rand() * skinTones.length)]!);
      }
    }
    return out.map(({ pos, col }) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
      g.computeVertexNormals();
      return g;
    });
  }, [colors]);
}

function Stand() {
  const steps = useMemo(() => Array.from({ length: ROWS }, (_, row) => row), []);
  return (
    <group>
      {steps.map((row) => (
        <mesh key={row} position={[0, (0.5 + row * ROW_RISE) / 2, STAND_Z0 - row * ROW_DEPTH]}>
          <boxGeometry args={[32, 0.5 + row * ROW_RISE, ROW_DEPTH]} />
          <meshStandardMaterial color={row % 2 === 0 ? STAND : STAND_STEP} />
        </mesh>
      ))}
      {/* paredón de fondo + techo en voladizo */}
      <mesh position={[0, 3.6, STAND_Z0 - ROWS * ROW_DEPTH - 0.2]}>
        <boxGeometry args={[32, 7.2, 0.4]} />
        <meshStandardMaterial color={STAND} />
      </mesh>
      <mesh position={[0, 0.5 + ROWS * ROW_RISE + 1.6, STAND_Z0 - ROWS * ROW_DEPTH * 0.55]} rotation={[0.12, 0, 0]}>
        <boxGeometry args={[32, 0.14, ROWS * ROW_DEPTH * 1.1]} />
        <meshStandardMaterial color="#141414" />
      </mesh>
    </group>
  );
}

export function Crowd({ colors, groupRefs }: { colors: readonly string[]; groupRefs: (i: number, g: THREE.Group | null) => void }) {
  const geos = useCrowdGeometries(colors);
  return (
    <group>
      {geos.map((g, i) => (
        <group key={i} ref={(el) => groupRefs(i, el)}>
          <mesh geometry={g}>
            <meshStandardMaterial vertexColors flatShading />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/** Césped, líneas, carteles y tribuna (sin el arco ni el público, que se animan). */
export function Pitch() {
  return (
    <>
      <Grass />
      <PitchLines />
      <Boards />
      <Stand />
    </>
  );
}
