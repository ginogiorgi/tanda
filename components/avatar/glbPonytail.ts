/**
 * Cola de caballo (pedido de Gino 16/11): el pack Standard de Quaternius no trae cola ni trenza, así que
 * se genera acá, como los botines (`glbShoes`): un tubo cerrado que sale de la nuca del casquete
 * `Hair_BuzzedFemale` (pelo "tirado para atrás") y cae hacia la espalda, skinneado 100% al hueso `Head`
 * y con el MISMO material que el casquete (se tiñe con `uHair` igual que el resto del peinado).
 *
 * Todo se mide en el mundo de reposo del template (Y arriba, +Z adelante), sobre el propio casquete:
 * el punto más atrás de su perfil central es el nacimiento de la cola.
 */

import * as THREE from "three";
import { mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";

/** Malla generada (la del catálogo); se ve junto con su casquete (`HAIR_LAYERS`). */
export const PONYTAIL_MESH = "Hair_Ponytail";
const CAP_MESH = "Hair_BuzzedFemale";

const SLICES = 18;
const RING = 14;

/**
 * Eje de la cola, relativo al nacimiento (m): sale apenas hacia atrás y arriba (el atado), se curva y
 * cae sobre la espalda hasta la altura de los omóplatos.
 */
const PATH: readonly [number, number][] = [
  // [dy, dz]
  [0.004, 0.012],
  [0.01, -0.028],
  [-0.03, -0.05],
  [-0.11, -0.04],
  [-0.2, -0.012],
];

/**
 * Radio por tramo (t ∈ [0,1]): finito en el atado, se abre en el mechón y termina en punta. El
 * "cuello" en t≈0.12 lee como la gomita.
 */
function radius(t: number): number {
  if (t < 0.12) return THREE.MathUtils.lerp(0.024, 0.017, t / 0.12);
  if (t < 0.4) return THREE.MathUtils.lerp(0.017, 0.033, THREE.MathUtils.smoothstep(t, 0.12, 0.4));
  return THREE.MathUtils.lerp(0.033, 0.007, ((t - 0.4) / 0.6) ** 1.8);
}

/** Achatada de adelante hacia atrás (más ancha que profunda), como cae una cola real. */
const DEPTH = 0.78;

/** Punto más atrás del perfil central del casquete (en reposo). */
function anchorOf(cap: THREE.SkinnedMesh): THREE.Vector3 | null {
  const pos = cap.geometry.getAttribute("position");
  const v = new THREE.Vector3();
  let best: THREE.Vector3 | null = null;
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    cap.applyBoneTransform(i, v);
    v.applyMatrix4(cap.matrixWorld);
    if (Math.abs(v.x) > 0.025) continue;
    if (!best || v.z < best.z) best = v.clone();
  }
  return best;
}

/** Tubo cerrado a lo largo de `PATH` con normales hacia afuera (posiciones en mundo). */
export function ponytailPositions(anchor: THREE.Vector3): number[] {
  const curve = new THREE.CatmullRomCurve3(
    PATH.map(([dy, dz]) => new THREE.Vector3(anchor.x, anchor.y + dy, anchor.z + dz)),
    false,
    "centripetal",
  );
  const frames = curve.computeFrenetFrames(SLICES - 1, false);
  const rings: THREE.Vector3[][] = [];
  for (let j = 0; j < SLICES; j++) {
    const t = j / (SLICES - 1);
    const c = curve.getPointAt(t);
    const tan = frames.tangents[j]!;
    // Marco estable: "ancho" = X del mundo (la cola no gira), "profundidad" = perpendicular en el plano YZ.
    const side = new THREE.Vector3(1, 0, 0);
    const depth = new THREE.Vector3().crossVectors(tan, side).normalize();
    const r = radius(t);
    const ring: THREE.Vector3[] = [];
    for (let k = 0; k < RING; k++) {
      const a = (k / RING) * Math.PI * 2;
      ring.push(
        c
          .clone()
          .addScaledVector(side, Math.cos(a) * r)
          .addScaledVector(depth, Math.sin(a) * r * DEPTH),
      );
    }
    rings.push(ring);
  }
  const pos: number[] = [];
  const tri = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3) => pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
  for (let j = 0; j < SLICES - 1; j++) {
    for (let k = 0; k < RING; k++) {
      const a = rings[j]![k]!;
      const b = rings[j]![(k + 1) % RING]!;
      const c = rings[j + 1]![(k + 1) % RING]!;
      const d = rings[j + 1]![k]!;
      tri(a, b, c);
      tri(a, c, d);
    }
  }
  // Tapas: el atado (queda adentro del casquete) y la punta.
  const ends = [
    [rings[0]!, curve.getPointAt(0), true],
    [rings[SLICES - 1]!, curve.getPointAt(1), false],
  ] as const;
  for (const [ring, center, start] of ends) {
    for (let k = 0; k < RING; k++) {
      const a = ring[k]!;
      const b = ring[(k + 1) % RING]!;
      if (start) tri(center, b, a);
      else tri(center, a, b);
    }
  }
  // El winding de arriba depende de la orientación del marco: se corrige con el volumen con signo
  // (positivo = normales hacia afuera; lo exige `assets.test.ts`).
  if (signedVolume(pos) < 0) {
    for (let i = 0; i < pos.length; i += 9) {
      for (let e = 0; e < 3; e++) {
        const tmp = pos[i + 3 + e]!;
        pos[i + 3 + e] = pos[i + 6 + e]!;
        pos[i + 6 + e] = tmp;
      }
    }
  }
  return pos;
}

function signedVolume(pos: number[]): number {
  let vol = 0;
  for (let i = 0; i < pos.length; i += 9) {
    const [ax, ay, az, bx, by, bz, cx, cy, cz] = pos.slice(i, i + 9) as [number, number, number, number, number, number, number, number, number];
    vol += (ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)) / 6;
  }
  return vol;
}

/**
 * Agrega a `scene` (template en reposo, sin padre) la cola sobre el casquete de `Hair_BuzzedFemale`,
 * oculta hasta que `applyHair` la prenda. Sin casquete o sin hueso `Head` no hace nada.
 */
export function attachPonytail(scene: THREE.Object3D): void {
  const cap = scene.getObjectByName(CAP_MESH);
  const head = scene.getObjectByName("Head");
  if (!(cap instanceof THREE.SkinnedMesh) || !(head instanceof THREE.Bone)) return;
  const anchor = anchorOf(cap);
  if (!anchor) return;
  let g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(ponytailPositions(anchor), 3));
  g = mergeVertices(g, 1e-5);
  g.computeVertexNormals();
  const n = g.getAttribute("position").count;
  const idx = new Uint16Array(n * 4);
  const w = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) w[i * 4] = 1;
  g.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(idx, 4));
  g.setAttribute("skinWeight", new THREE.Float32BufferAttribute(w, 4));
  const mat = Array.isArray(cap.material) ? cap.material[0]! : cap.material;
  const mesh = new THREE.SkinnedMesh(g, mat);
  mesh.name = PONYTAIL_MESH;
  mesh.visible = false;
  mesh.frustumCulled = false;
  // Esqueleto propio de un hueso: inversa = reposo actual (identidad al bindear), como los botines.
  mesh.bind(new THREE.Skeleton([head]), new THREE.Matrix4());
  scene.add(mesh);
}
