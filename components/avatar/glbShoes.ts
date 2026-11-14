/**
 * Calzado con forma para el avatar GLB. El pack trae el pie descalzo: acá se genera, por cuerpo,
 * un zapato que envuelve el pie (loft de secciones superelípticas medidas sobre los vértices del
 * pie en reposo) + suela, skinneado a `foot_*`/`ball_*` para que la puntera doble con los dedos.
 *
 * Se arman las tres variantes (`sneakers`/`boots`/`cleats`) una vez por GLB (en el template de
 * `GlbAvatar`, cada instancia las clona) y se prende la elegida (`setShoes`). Todo se mide en el "mundo de reposo" del clon recién creado (Y arriba, +Z adelante).
 */

import * as THREE from "three";
import { mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { dominantBone } from "./glbRig";

export type ShoePart = "sneakers" | "boots" | "cleats";
const PARTS: readonly ShoePart[] = ["sneakers", "boots", "cleats"];

interface ShoeStyle {
  /** Alto de la suela (m). */
  sole: number;
  /** Margen del capellada sobre el pie (m). */
  margin: number;
  /** Tapones bajo la suela. */
  studs: boolean;
}

const STYLE: Record<ShoePart, ShoeStyle> = {
  sneakers: { sole: 0.022, margin: 0.012, studs: false },
  boots: { sole: 0.012, margin: 0.009, studs: false },
  cleats: { sole: 0.012, margin: 0.009, studs: true },
};

/** Secciones del loft (talón → punta) y puntos por sección. */
const SLICES = 12;
const RING = 12;
/** Exponente de la superelipse (más chico = más cuadrado). */
const SQUARE = 0.55;
/** Prefijo de los grupos de cada variante en el clon. */
const GROUP_PREFIX = "Shoes_";
const UPPER = "ShoeUpper";
const SOLE = "ShoeSole";

interface Slice {
  z: number;
  xMin: number;
  xMax: number;
  yTop: number;
}

/** Perfil del pie: ancho y alto por franja de z (rellena huecos con la vecina). */
function footSlices(points: THREE.Vector3[]): Slice[] {
  let zMin = Infinity;
  let zMax = -Infinity;
  for (const p of points) {
    zMin = Math.min(zMin, p.z);
    zMax = Math.max(zMax, p.z);
  }
  const step = (zMax - zMin) / (SLICES - 1);
  const slices: (Slice | null)[] = [];
  for (let j = 0; j < SLICES; j++) {
    const z = zMin + j * step;
    let xMin = Infinity;
    let xMax = -Infinity;
    let yTop = -Infinity;
    for (const p of points) {
      if (Math.abs(p.z - z) > step * 0.75) continue;
      xMin = Math.min(xMin, p.x);
      xMax = Math.max(xMax, p.x);
      yTop = Math.max(yTop, p.y);
    }
    slices.push(Number.isFinite(yTop) ? { z, xMin, xMax, yTop } : null);
  }
  // Franjas vacías: copia de la vecina más cercana con datos (siempre SLICES secciones parejas: los
  // tapones se ubican por fracción del largo).
  const filled = slices.map((s, j) => {
    if (s) return s;
    for (let d = 1; d < SLICES; d++) {
      const n = slices[j - d] ?? slices[j + d];
      if (n) return n;
    }
    return null;
  });
  return filled.flatMap((s, j) => (s ? [{ ...s, z: zMin + j * step }] : []));
}

/** Peso del hueso `ball` según z (transición de 3 cm alrededor de la articulación). */
function ballWeight(z: number, ballZ: number): number {
  return THREE.MathUtils.smoothstep(z, ballZ - 0.015, ballZ + 0.015);
}

/**
 * Loft cerrado: anillos superelípticos (x, y) por sección, de `y0` a `yTop`, con tapas en talón y
 * punta. `grow` agranda todo (margen); las secciones extremas se achican para redondear.
 */
function loft(slices: Slice[], y0: (s: Slice) => number, y1: (s: Slice) => number, grow: number): number[] {
  const rings: THREE.Vector3[][] = [];
  const n = slices.length;
  slices.forEach((s, j) => {
    const f = j / (n - 1);
    // Talón y punta redondeados: las secciones extremas se achican y se corren hacia afuera.
    const end = Math.max(0, Math.abs(2 * f - 1) - 0.6) / 0.4; // 0 en el medio, 1 en las puntas
    const shrink = 1 - 0.3 * end * end;
    const cx = (s.xMin + s.xMax) / 2;
    const hw = ((s.xMax - s.xMin) / 2 + grow) * shrink;
    const bottom = y0(s);
    const top = bottom + (y1(s) + grow - bottom) * (1 - 0.35 * end * end);
    const cy = (bottom + top) / 2;
    const hh = (top - bottom) / 2;
    const z = s.z + (f < 0.5 ? -grow : grow) * end;
    const ring: THREE.Vector3[] = [];
    for (let k = 0; k < RING; k++) {
      const a = (k / RING) * Math.PI * 2;
      const c = Math.cos(a);
      const sn = Math.sin(a);
      ring.push(
        new THREE.Vector3(cx + hw * Math.sign(c) * Math.abs(c) ** SQUARE, cy + hh * Math.sign(sn) * Math.abs(sn) ** SQUARE, z),
      );
    }
    rings.push(ring);
  });
  const pos: number[] = [];
  const tri = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3) => pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
  for (let j = 0; j < n - 1; j++) {
    for (let k = 0; k < RING; k++) {
      const a = rings[j]![k]!;
      const b = rings[j]![(k + 1) % RING]!;
      const c = rings[j + 1]![(k + 1) % RING]!;
      const d = rings[j + 1]![k]!;
      tri(a, c, b);
      tri(a, d, c);
    }
  }
  for (const [ring, flip] of [
    [rings[0]!, true],
    [rings[n - 1]!, false],
  ] as const) {
    const center = ring.reduce((acc, p) => acc.add(p), new THREE.Vector3()).divideScalar(RING);
    for (let k = 0; k < RING; k++) {
      const a = ring[k]!;
      const b = ring[(k + 1) % RING]!;
      if (flip) tri(center, a, b);
      else tri(center, b, a);
    }
  }
  return pos;
}

/** Tapones: 4 adelante + 2 en el talón, cajitas bajo la suela. */
function studs(slices: Slice[]): number[] {
  const box = new THREE.BoxGeometry(0.012, 0.009, 0.012).toNonIndexed();
  const src = box.getAttribute("position");
  const pos: number[] = [];
  const n = slices.length;
  const at = [
    [0.12, 0.3],
    [0.12, 0.7],
    [0.62, 0.25],
    [0.62, 0.75],
    [0.85, 0.3],
    [0.85, 0.7],
  ] as const;
  for (const [fz, fx] of at) {
    const s = slices[Math.round(fz * (n - 1))]!;
    const x = s.xMin + (s.xMax - s.xMin) * fx;
    for (let i = 0; i < src.count; i++) pos.push(src.getX(i) + x, src.getY(i) - 0.0045, src.getZ(i) + s.z);
  }
  box.dispose();
  return pos;
}

/** SkinnedMesh en mundo de reposo con pesos foot/ball por z. */
function skinned(pos: number[], skeleton: THREE.Skeleton, ballZ: number, name: string, smooth: boolean): THREE.SkinnedMesh {
  let g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  const count = pos.length / 3;
  const idx = new Uint16Array(count * 4);
  const w = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    const t = ballWeight(pos[i * 3 + 2]!, ballZ);
    idx[i * 4 + 1] = 1;
    w[i * 4] = 1 - t;
    w[i * 4 + 1] = t;
  }
  g.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(idx, 4));
  g.setAttribute("skinWeight", new THREE.Float32BufferAttribute(w, 4));
  // Capellada suave (vértices soldados → normales promediadas); la suela queda facetada.
  if (smooth) g = mergeVertices(g, 1e-5);
  g.computeVertexNormals();
  const mesh = new THREE.SkinnedMesh(g, new THREE.MeshStandardMaterial({ roughness: 0.6, flatShading: !smooth }));
  mesh.name = name;
  mesh.frustumCulled = false;
  mesh.bind(skeleton, new THREE.Matrix4());
  return mesh;
}

/**
 * Agrega a `scene` (clon recién hecho, en reposo, sin padre) las tres variantes de calzado sobre
 * los pies de `body`. Quedan ocultas hasta `setShoes`.
 */
export function attachShoes(scene: THREE.Object3D, body: THREE.SkinnedMesh): void {
  const bones = body.skeleton.bones;
  const pos = body.geometry.getAttribute("position");
  const sideOf = bones.map((b) => /^(?:foot|ball)_([lr])$/.exec(b.name)?.[1] as "l" | "r" | undefined);
  const feet: Record<"l" | "r", THREE.Vector3[]> = { l: [], r: [] };
  for (let i = 0; i < pos.count; i++) {
    const side = sideOf[dominantBone(body.geometry, i)];
    if (!side) continue;
    const v = new THREE.Vector3().fromBufferAttribute(pos, i);
    body.applyBoneTransform(i, v);
    feet[side].push(v.applyMatrix4(body.matrixWorld));
  }

  const groups = new Map<ShoePart, THREE.Group>();
  for (const part of PARTS) {
    const g = new THREE.Group();
    g.name = GROUP_PREFIX + part;
    g.visible = false;
    groups.set(part, g);
    scene.add(g);
  }
  for (const side of ["l", "r"] as const) {
    const foot = bones.find((b) => b.name === `foot_${side}`);
    const ball = bones.find((b) => b.name === `ball_${side}`);
    const points = feet[side];
    if (!foot || !ball || points.length < 20) continue;
    const ballZ = new THREE.Vector3().setFromMatrixPosition(ball.matrixWorld).z;
    const slices = footSlices(points);
    // Un esqueleto propio con los dos huesos (compartido por las variantes): inversas = reposo
    // actual (identidad al bindear).
    const skeleton = new THREE.Skeleton([foot, ball]);
    for (const part of PARTS) {
      const st = STYLE[part];
      const upper = loft(slices, () => 0.004, (s) => s.yTop, st.margin);
      const sole = loft(slices, () => 0, () => st.sole, st.margin + 0.004);
      if (st.studs) sole.push(...studs(slices));
      const group = groups.get(part)!;
      group.add(skinned(upper, skeleton, ballZ, UPPER, true), skinned(sole, skeleton, ballZ, SOLE, false));
    }
  }
}

/** Suela que contrasta con la capellada (las zapatillas, siempre clara). */
function soleColor(part: ShoePart, upper: THREE.Color): THREE.Color {
  if (part === "sneakers") return new THREE.Color("#ede9df");
  const lum = 0.2126 * upper.r + 0.7152 * upper.g + 0.0722 * upper.b;
  return new THREE.Color(lum > 0.35 ? "#141414" : "#ede9df");
}

function isShoePart(part: string): part is ShoePart {
  return (PARTS as readonly string[]).includes(part);
}

/** Prende la variante `part` y la pinta de `color` (llamar dentro de un traverse-safe hook). */
export function setShoes(scene: THREE.Object3D, part: string, color: string): void {
  const chosen: ShoePart = isShoePart(part) ? part : "sneakers";
  const upperColor = new THREE.Color(color);
  const sole = soleColor(chosen, upperColor);
  for (const p of PARTS) {
    const g = scene.getObjectByName(GROUP_PREFIX + p);
    if (!g) continue;
    g.visible = p === chosen;
    if (p !== chosen) continue;
    g.traverse((o) => {
      if (!(o instanceof THREE.Mesh) || !(o.material instanceof THREE.MeshStandardMaterial)) return;
      o.material.color.copy(o.name === SOLE ? sole : upperColor);
    });
  }
}
