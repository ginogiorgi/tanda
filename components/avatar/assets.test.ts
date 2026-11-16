/**
 * QA geométrico de los assets del avatar (feedback 2, P7a.2), en Node sobre los GLB reales.
 * Botines: malla cerrada, normales hacia afuera (antes el loft salía con el winding invertido y con
 * `FrontSide` se veía el interior: "no se ve la cara de adelante de los zapatos").
 */
import * as THREE from "three";
import { beforeAll, describe, expect, it } from "vitest";
import { loadGlbScene } from "@/lib/avatar/glbNode";
import { uncoveredFraction, type HairTri, type ScalpPoint } from "@/lib/avatar/hairCoverage";
import { boundaryEdges, inwardFraction, signedVolume, triangles, type Tri } from "@/lib/avatar/meshChecks";
import type { BodyType } from "@/lib/avatar/types";
import { HAIR_MESHES, hairMesh, hairMeshes, hairOptionsFor } from "@/lib/avatar/catalog";
import { BODIES, templateOf } from "./glbModel";
import { dominantBone } from "./glbRig";

const scenes = new Map<BodyType, THREE.Object3D>();
beforeAll(async () => {
  for (const b of BODIES) scenes.set(b, templateOf(await loadGlbScene(b), b));
}, 60_000);

function trisOf(mesh: THREE.Mesh): Tri[] {
  const g = mesh.geometry;
  return triangles(g.getAttribute("position").array, g.getIndex()?.array);
}

describe.each(BODIES)("botines %s", (body) => {
  for (const part of ["sneakers", "boots", "cleats"]) {
    it(`${part}: cerrados y con las caras hacia afuera`, () => {
      const group = scenes.get(body)!.getObjectByName(`Shoes_${part}`)!;
      const meshes: THREE.Mesh[] = [];
      group.traverse((o) => {
        if (o instanceof THREE.Mesh) meshes.push(o);
      });
      expect(meshes.length).toBe(4); // capellada + suela por pie
      for (const m of meshes) {
        const tris = trisOf(m);
        if (m.name === "ShoeUpper") {
          expect(boundaryEdges(tris)).toBe(0);
          expect(inwardFraction(tris)).toBeLessThan(0.005);
        }
        expect(signedVolume(tris)).toBeGreaterThan(0);
        const mat = m.material as THREE.MeshStandardMaterial;
        expect(mat.side).toBe(THREE.FrontSide);
      }
    });
  }
});

describe("cola de caballo (malla generada)", () => {
  it("cerrada, normales hacia afuera, detrás de la nuca y colgada del hueso Head", () => {
    const scene = scenes.get("female")!;
    const tail = scene.getObjectByName("Hair_Ponytail") as THREE.SkinnedMesh;
    expect(tail).toBeInstanceOf(THREE.SkinnedMesh);
    const tris = trisOf(tail);
    expect(boundaryEdges(tris)).toBe(0);
    // Cerrada + volumen con signo > 0 = hacia afuera (`inwardFraction` mide contra el centroide global:
    // en un tubo curvo la cara interna de la curva lo "mira" y no aplica).
    expect(signedVolume(tris)).toBeGreaterThan(0);
    expect(tail.skeleton.bones.map((b) => b.name)).toEqual(["Head"]);
    const box = new THREE.Box3().setFromBufferAttribute(tail.geometry.getAttribute("position") as THREE.BufferAttribute);
    const cap = new THREE.Box3().setFromObject(scene.getObjectByName("Hair_BuzzedFemale")!);
    expect(box.min.z).toBeLessThan(cap.min.z - 0.03); // sobresale atrás
    expect(box.max.z).toBeLessThan(cap.min.z + 0.03); // nace en la nuca, no en la cara
    expect(box.min.y).toBeGreaterThan(1.3); // no pasa de los omóplatos
  });
});

describe("meshChecks discrimina", () => {
  it("una caja de three: cerrada, volumen +, nada hacia adentro; dada vuelta: volumen −", () => {
    const box = new THREE.BoxGeometry(1, 1, 1);
    const t = triangles(box.getAttribute("position").array, box.getIndex()!.array);
    expect(boundaryEdges(t)).toBe(0);
    expect(signedVolume(t)).toBeCloseTo(1, 5);
    expect(inwardFraction(t)).toBe(0);
    const flipped = t.map(({ a, b, c }) => ({ a, b: c, c: b }));
    expect(signedVolume(flipped)).toBeCloseTo(-1, 5);
    expect(inwardFraction(flipped)).toBe(1);
    expect(boundaryEdges(t.slice(2))).toBeGreaterThan(0);
  });
});

/** Vértices en mundo de reposo con el skinning aplicado. */
function worldVerts(mesh: THREE.SkinnedMesh): THREE.Vector3[] {
  const pos = mesh.geometry.getAttribute("position");
  return Array.from({ length: pos.count }, (_, i) => {
    const v = new THREE.Vector3().fromBufferAttribute(pos, i);
    mesh.applyBoneTransform(i, v);
    return v.applyMatrix4(mesh.matrixWorld);
  });
}

/**
 * Cuero cabelludo: vértices del cuerpo pesados a `head`, por encima de las cejas y que no miran al
 * frente (la frente queda libre en los peinados con raya). `n.z < 0.3` = coronilla, costados, nuca.
 */
function scalpOf(scene: THREE.Object3D): ScalpPoint[] {
  const meshes = new Map<string, THREE.SkinnedMesh>();
  scene.traverse((o) => {
    if (o instanceof THREE.SkinnedMesh) meshes.set(o.name, o);
  });
  const body = [...meshes.values()].find((m) => (m.material as THREE.Material).name.startsWith("MI_Superhero"))!;
  const browTop = Math.max(...worldVerts(meshes.get("Eyebrows")!).map((v) => v.y));
  const nrm = body.geometry.getAttribute("normal");
  const bones = body.skeleton.bones;
  const out: ScalpPoint[] = [];
  worldVerts(body).forEach((v, i) => {
    if (!/^head/i.test(bones[dominantBone(body.geometry, i)]!.name) || v.y <= browTop) return;
    const n = new THREE.Vector3().fromBufferAttribute(nrm, i).transformDirection(body.matrixWorld);
    if (n.z < 0.3) out.push({ p: [v.x, v.y, v.z], n: [n.x, n.y, n.z] });
  });
  return out;
}

function hairTris(mesh: THREE.SkinnedMesh): HairTri[] {
  const v = worldVerts(mesh);
  const idx = mesh.geometry.getIndex()!;
  const out: HairTri[] = [];
  for (let k = 0; k < idx.count; k += 3) {
    const [a, b, c] = [v[idx.getX(k)]!, v[idx.getX(k + 1)]!, v[idx.getX(k + 2)]!];
    out.push({ a: [a.x, a.y, a.z], b: [b.x, b.y, b.z], c: [c.x, c.y, c.z] });
  }
  return out;
}

/** Cobertura máxima tolerada (coronilla/costados/nuca a ≤ 4 cm del pelo). */
const MAX_UNCOVERED = 0.02;

describe.each(BODIES)("pelo %s: tapa el cráneo (no lo corta)", (body) => {
  for (const { id } of hairOptionsFor(body).filter((h) => h.id !== "none")) {
    it(id, () => {
      const scene = scenes.get(body)!;
      const name = hairMesh(id, body)!;
      const tris = hairMeshes(name).flatMap((n) => hairTris(scene.getObjectByName(n) as THREE.SkinnedMesh));
      const f = uncoveredFraction(scalpOf(scene), tris, 0.04);
      expect(f, `${name} en ${body}: ${(f * 100).toFixed(1)}% del cuero asoma`).toBeLessThanOrEqual(MAX_UNCOVERED);
    });
  }

  it("el chequeo discrimina: un peinado de la otra cabeza sin ajuste falla", () => {
    const scene = scenes.get(body)!;
    const wrong = body === "male" ? "Hair_BuzzedFemale" : "Hair_SimpleParted";
    const f = uncoveredFraction(scalpOf(scene), hairTris(scene.getObjectByName(wrong) as THREE.SkinnedMesh), 0.04);
    expect(f).toBeGreaterThan(0.3);
  });
});

describe.each(BODIES)("skinning y catálogo %s", (body) => {
  it("pesos que suman 1 y el pelo pesado solo a cabeza/cuello", () => {
    const scene = scenes.get(body)!;
    scene.traverse((o) => {
      if (!(o instanceof THREE.SkinnedMesh) || o.name.startsWith("Shoe")) return;
      const sw = o.geometry.getAttribute("skinWeight");
      const si = o.geometry.getAttribute("skinIndex");
      const bones = o.skeleton.bones;
      const hair = o.name.startsWith("Hair_") || o.name === "Eyebrows";
      for (let i = 0; i < sw.count; i++) {
        let sum = 0;
        for (let k = 0; k < 4; k++) {
          const w = sw.getComponent(i, k);
          sum += w;
          if (hair && w > 0.01) expect(bones[si.getComponent(i, k)]!.name, o.name).toMatch(/^(Head|neck)/i);
        }
        expect(Math.abs(sum - 1), `${o.name} v${i}`).toBeLessThan(1e-2);
      }
    });
  });

  it("catálogo ↔ GLB: cada peinado ofrecido existe y no hay mallas de pelo fuera del catálogo", () => {
    const scene = scenes.get(body)!;
    for (const { id } of hairOptionsFor(body)) {
      const name = hairMesh(id, body);
      if (name) expect(scene.getObjectByName(name), `${id}→${name}`).toBeDefined();
    }
    const inGlb: string[] = [];
    scene.traverse((o) => {
      if (o.name.startsWith("Hair_")) inGlb.push(o.name);
    });
    for (const n of inGlb) expect(HAIR_MESHES as readonly string[], n).toContain(n);
  });
});
