/**
 * Cresta del mohicano para el avatar GLB. El pack no trae una: se genera en runtime sobre el perfil
 * sagital del rapado (`Hair_Buzzed*`) de ese cuerpo, como una fila de púas low-poly inclinadas
 * hacia atrás, y se cuelga del hueso `Head` (sigue al rig sin skinning).
 *
 * Se arma en el espacio "mundo de reposo" del clon recién creado (Y arriba, +Z adelante): ahí cada
 * vértice del rapado es `Head.matrixWorld · boneInverse · bindMatrix · pos`. Al final se pasa todo
 * a espacio local del hueso.
 */

import * as THREE from "three";

/** Púas de atrás (nuca) hacia adelante (frente). */
const SPIKES = 7;
/** Alto de la púa (m) según la posición en la cresta: más alta arriba/adelante. */
const SPIKE_H_MIN = 0.035;
const SPIKE_H_MAX = 0.065;
/** Medio ancho lateral (x) y medio largo a lo largo del cráneo de la base de cada púa (m). */
const HALF_W = 0.012;
const HALF_L = 0.022;
/** Inclinación de la punta hacia atrás (fracción del alto). */
const LEAN_BACK = 0.45;
/** Cuánto se hunde la base en el cráneo para no dejar luz (m). */
const SINK = 0.006;

/** Nombre de la malla de la cresta (para encontrarla en el clon). */
export const CREST_NAME = "Hair_MohawkCrest";

/** Perfil de la coronilla: punto más alto por franja de 1 cm en z, sobre el plano medio (x≈0). */
function scalpProfile(points: THREE.Vector3[]): THREE.Vector3[] {
  let top = -Infinity;
  for (const p of points) top = Math.max(top, p.y);
  const byZ = new Map<number, THREE.Vector3>();
  for (const p of points) {
    // Solo el casco de arriba: descarta la cara interna de la nuca y las patillas.
    if (Math.abs(p.x) > 0.012 || p.y < top - 0.07) continue;
    const k = Math.round(p.z * 100);
    const prev = byZ.get(k);
    if (!prev || p.y > prev.y) byZ.set(k, p);
  }
  return [...byZ.values()].sort((a, b) => a.z - b.z);
}

/** Punto a fracción `t` del largo de la polilínea. */
function along(path: THREE.Vector3[], t: number): THREE.Vector3 {
  const lens = [0];
  for (let i = 1; i < path.length; i++) lens.push(lens[i - 1]! + path[i]!.distanceTo(path[i - 1]!));
  const target = t * lens[lens.length - 1]!;
  for (let i = 1; i < path.length; i++) {
    if (lens[i]! >= target) {
      const seg = lens[i]! - lens[i - 1]!;
      const f = seg > 0 ? (target - lens[i - 1]!) / seg : 0;
      return path[i - 1]!.clone().lerp(path[i]!, f);
    }
  }
  return path[path.length - 1]!.clone();
}

/**
 * Geometría de la cresta (en mundo de reposo) sobre el perfil dado, o `null` si el perfil no
 * alcanza (malla inesperada).
 */
function crestGeometry(profile: THREE.Vector3[], center: THREE.Vector3): THREE.BufferGeometry | null {
  if (profile.length < 4) return null;
  const pos: number[] = [];
  const side = new THREE.Vector3(1, 0, 0);
  for (let i = 0; i < SPIKES; i++) {
    // De 8% (nuca) a 88% (sin pasarse de la frente).
    const t = 0.08 + (0.8 * i) / (SPIKES - 1);
    const p = along(profile, t);
    const ahead = along(profile, Math.min(1, t + 0.02));
    const behind = along(profile, Math.max(0, t - 0.02));
    const tangent = ahead.sub(behind).normalize(); // hacia adelante, sobre el cráneo
    const normal = p.clone().sub(center).normalize();
    const h = SPIKE_H_MIN + (SPIKE_H_MAX - SPIKE_H_MIN) * Math.sin(Math.PI * (0.25 + 0.6 * (i / (SPIKES - 1))));
    const base = p.clone().addScaledVector(normal, -SINK);
    const tip = p.clone().addScaledVector(normal, h).addScaledVector(tangent, -LEAN_BACK * h);
    const c = (sx: number, sl: number) =>
      base.clone().addScaledVector(side, sx * HALF_W).addScaledVector(tangent, sl * HALF_L);
    const quad = [c(-1, -1), c(1, -1), c(1, 1), c(-1, 1)];
    for (let k = 0; k < 4; k++) {
      const a = quad[k]!;
      const b = quad[(k + 1) % 4]!;
      pos.push(a.x, a.y, a.z, b.x, b.y, b.z, tip.x, tip.y, tip.z);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  return g;
}

/**
 * Crea la cresta sobre el rapado `buzzed` (clon recién hecho, en reposo) y la cuelga de su hueso
 * `Head`. Queda invisible hasta que se elija el mohicano. Si la malla no es la esperada, no hace nada.
 */
export function attachCrest(buzzed: THREE.SkinnedMesh, material: THREE.Material): void {
  const bones = buzzed.skeleton.bones;
  const headIdx = bones.findIndex((b) => b.name === "Head");
  const head = bones[headIdx];
  const inverse = buzzed.skeleton.boneInverses[headIdx];
  if (!head || !inverse) return;

  head.updateWorldMatrix(true, false);
  const toRestWorld = head.matrixWorld.clone().multiply(inverse).multiply(buzzed.bindMatrix);
  const attr = buzzed.geometry.getAttribute("position");
  const points: THREE.Vector3[] = [];
  const box = new THREE.Box3();
  for (let i = 0; i < attr.count; i++) {
    const p = new THREE.Vector3().fromBufferAttribute(attr, i).applyMatrix4(toRestWorld);
    points.push(p);
    box.expandByPoint(p);
  }
  // Centro del cráneo: medio en x/z, un poco por debajo de la mitad en y (la normal sale radial).
  const center = box.getCenter(new THREE.Vector3());
  center.y = box.min.y + 0.4 * (box.max.y - box.min.y);

  const g = crestGeometry(scalpProfile(points), center);
  if (!g) return;
  g.applyMatrix4(head.matrixWorld.clone().invert()); // mundo de reposo → local del hueso
  g.computeVertexNormals(); // no indexada → caras planas
  const mesh = new THREE.Mesh(g, material);
  mesh.name = CREST_NAME;
  mesh.visible = false;
  head.add(mesh);
}
