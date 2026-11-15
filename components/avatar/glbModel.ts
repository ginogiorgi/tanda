/**
 * Lógica three PURA del avatar GLB (sin React): template por GLB, instancia con materiales propios, kit
 * (ropa por región en el shader), peinado y botines. La usan `GlbAvatar` (R3F) y los tests en Node
 * (`components/avatar/glbModel.test.ts`), que la ejercitan sin WebGL.
 *
 * Invariante (feedback 2, P2.2): una instancia NUNCA se ve en la pose de bind del pack (T-pose). Se
 * crea ya posada (rig en reposo = brazos abajo); antes la pose llegaba solo en el primer frame
 * renderizado y, con `frameloop="demand"`, el personaje podía quedar en T-pose hasta la jugada.
 */

import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import { JOINTS } from "@/lib/avatar/rig";
import type { AvatarConfig, BodyType, HexColor } from "@/lib/avatar/types";
import { attachCrest, CREST_NAME } from "./glbCrest";
import { attachShoes } from "./glbShoes";
import { createGlbRig, dominantBone, driveGlbRig, type GlbRig, type ProxyRig } from "./glbRig";
import { ROOT_PIVOT_Y } from "./rigPose";

export const GLB_URL: Record<BodyType, string> = {
  male: "/models/avatar/avatar-male.glb",
  female: "/models/avatar/avatar-female.glb",
};

/** `hair.part` → malla del pack. `mohawk` = rapado + cresta generada (`glbCrest`). */
const HAIR_MESH: Record<string, string | null> = {
  none: null,
  short: "Hair_SimpleParted",
  long: "Hair_Long",
  bun: "Hair_Buns",
};
const HAIR_MESHES = ["Hair_SimpleParted", "Hair_Long", "Hair_Buzzed", "Hair_BuzzedFemale", "Hair_Buns"];

/** El rapado está modelado por cuerpo (el de hombre flota sobre la cabeza de la mujer). */
function buzzedMesh(body: BodyType): string {
  return body === "female" ? "Hair_BuzzedFemale" : "Hair_Buzzed";
}

export function hairMesh(part: string, body: BodyType): string | null {
  if (part === "buzz" || part === "mohawk") return buzzedMesh(body);
  return HAIR_MESH[part] ?? null;
}

/**
 * La textura del pelo es gris (~0.6) y se tiñe multiplicando: la cresta, sin textura, usa el color
 * atenuado para que pegue con el rapado.
 */
const CREST_SHADE = 0.62;

/** Mitad de la altura (~1.85 m) para centrar en el creador; en la escena va `grounded`. */
export const HALF_HEIGHT = 0.92;

export interface Outfit {
  /** Fin de la manga: |x| en bind (T-pose → el plano es perpendicular al brazo). */
  sleeveX: number;
  /** Dobladillo del pantalón: y en bind (0 = hasta el botín). */
  hemY: number;
}

/**
 * Cortes medidos sobre el bind normalizado (T-pose, pies en 0, 1.85 m). Brazos: solo por encima
 * de y≈1.39; torso hasta |x| 0.21 (H) / 0.16 (M); codo ≈0.45/0.40; muñeca ≈0.71/0.665.
 */
const SLEEVE_X: Record<BodyType, Record<"tank" | "tee" | "longsleeve", number>> = {
  male: { tank: 0.215, tee: 0.32, longsleeve: 0.705 },
  female: { tank: 0.165, tee: 0.28, longsleeve: 0.66 },
};
/**
 * Corte del short (rodilla ≈0.54, cadera ≈0.97 en el modelo). Más largo que medio muslo: tapa la
 * ropa interior que trae pintada la textura del pack.
 */
const SHORT_HEM_Y = 0.66;

export function outfitOf(config: AvatarConfig): Outfit {
  const t = config.top.part;
  const sleeve = t === "tank" || t === "longsleeve" ? t : "tee";
  return {
    sleeveX: SLEEVE_X[config.bodyType][sleeve],
    hemY: config.bottom.part === "shorts" ? SHORT_HEM_Y : 0,
  };
}

/** Altura del cuerpo en bind (m), para normalizar. */
const BODY_HEIGHT = 1.85;
/** Cintura: remera arriba, short/pantalón abajo. */
const WAIST_Y = 1.02;
/** Tobillo: botín abajo (pie hasta ≈0.11, pantorrilla desde ≈0.06). */
const ANKLE_Y = 0.1;
/** El pie descalzo queda adentro del zapato (`glbShoes`): se descarta para que no asomen los dedos. */
const FOOT_HIDE_Y = 0.085;
/** Por encima de esto y con |x| > manga es brazo (el torso no pasa |x| 0.21 ahí). */
const ARM_Y = 1.36;

/**
 * Atributos `aBind` (posición en bind normalizada) y `aHead` (1 = cabeza/cuello → siempre piel).
 * Las regiones de ropa se deciden por fragmento con planos sobre `aBind` → cortes rectos (un
 * atributo por vértice deja el borde en zigzag siguiendo los triángulos).
 */
function prepareBody(mesh: THREE.SkinnedMesh): void {
  const g = mesh.geometry.clone();
  const pos = g.getAttribute("position");
  const isHead = mesh.skeleton.bones.map((b) => /^(neck|head)/i.test(b.name));
  const head = new Float32Array(pos.count);
  const bind = new Float32Array(pos.count * 3);
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).applyMatrix4(mesh.bindMatrix);
    bind.set([v.x, v.y, v.z], i * 3);
  }
  // La geometría viene cuantizada: se re-escala a metros con los límites del propio cuerpo (pies en
  // 0, coronilla en BODY_HEIGHT) para que los cortes no dependan de la cuantización.
  let minY = Infinity;
  let maxY = -Infinity;
  let minX = Infinity;
  let maxX = -Infinity;
  for (let i = 0; i < pos.count; i++) {
    minY = Math.min(minY, bind[i * 3 + 1]!);
    maxY = Math.max(maxY, bind[i * 3 + 1]!);
    minX = Math.min(minX, bind[i * 3]!);
    maxX = Math.max(maxX, bind[i * 3]!);
  }
  const k = BODY_HEIGHT / (maxY - minY);
  const cx = (minX + maxX) / 2;
  for (let i = 0; i < pos.count; i++) {
    bind[i * 3] = (bind[i * 3]! - cx) * k;
    bind[i * 3 + 1] = (bind[i * 3 + 1]! - minY) * k;
    bind[i * 3 + 2] = bind[i * 3 + 2]! * k;
    if (isHead[dominantBone(g, i)]) head[i] = 1;
  }
  g.setAttribute("aHead", new THREE.BufferAttribute(head, 1));
  g.setAttribute("aBind", new THREE.BufferAttribute(bind, 3));
  mesh.geometry = g;
}

export interface KitUniforms {
  uTop: { value: THREE.Color };
  uSash: { value: THREE.Color };
  uSashOn: { value: number };
  uBottom: { value: THREE.Color };
  uShoes: { value: THREE.Color };
  uSleeveX: { value: number };
  uHemY: { value: number };
}

export function setKit(u: KitUniforms, o: Outfit, top: HexColor, sash: HexColor | null, bottom: HexColor, shoes: HexColor): void {
  u.uSleeveX.value = o.sleeveX;
  u.uHemY.value = o.hemY;
  u.uTop.value.set(top);
  u.uSash.value.set(sash ?? top);
  u.uSashOn.value = sash ? 1 : 0;
  u.uBottom.value.set(bottom);
  u.uShoes.value.set(shoes);
}

function kitMaterial(base: THREE.Material, u: KitUniforms): THREE.Material {
  const m = base.clone();
  // El pack es un "superhéroe" con músculos marcados en el normal map: se suaviza para que la
  // ropa no parezca pintada sobre el cuerpo.
  if (m instanceof THREE.MeshStandardMaterial) m.normalScale.set(0.3, 0.3);
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, u);
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        "#include <common>\nattribute float aHead;\nattribute vec3 aBind;\nvarying float vHead;\nvarying vec3 vBind;",
      )
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvHead = aHead;\nvBind = aBind;");
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        "#include <common>\nuniform vec3 uTop;\nuniform vec3 uSash;\nuniform float uSashOn;\nuniform vec3 uBottom;\nuniform vec3 uShoes;\nuniform float uSleeveX;\nuniform float uHemY;\nvarying float vHead;\nvarying vec3 vBind;",
      )
      .replace(
        "#include <map_fragment>",
        [
          "#include <map_fragment>",
          // Región por planos en el bind (T-pose): 0 piel (textura), 1 remera, 2 pantalón, 3 botín.
          "float ax = abs(vBind.x);",
          "int region = 0;",
          `if (vBind.y < ${FOOT_HIDE_Y.toFixed(3)}) discard;`,
          `if (vBind.y < ${ANKLE_Y.toFixed(3)}) region = 3;`,
          `else if (vBind.y < ${WAIST_Y.toFixed(3)}) region = vBind.y < uHemY ? 0 : 2;`,
          // brazos (solo existen arriba de y≈1.39): manga hasta uSleeveX, después piel
          `else if (vBind.y > ${ARM_Y.toFixed(3)} && ax > uSleeveX) region = 0;`,
          "else region = 1;",
          "if (vHead > 0.5) region = 0;",
          "if (region > 0) {",
          "  vec3 c = region == 1 ? uTop : (region == 2 ? uBottom : uShoes);",
          // banda diagonal: hombro izquierdo (+X) → cadera derecha, solo en la remera
          "  float d = abs((vBind.y - 1.22) - 1.15 * vBind.x);",
          "  if (region == 1 && uSashOn > 0.5 && d < 0.075) c = uSash;",
          "  diffuseColor.rgb = c;",
          "}",
        ].join("\n"),
      );
  };
  m.customProgramCacheKey = () => "tanda-kit";
  return m;
}

const isBody = (m: THREE.Material) => m.name.startsWith("MI_Superhero");

/** GLB → clon preparado (en reposo, nunca se anima ni se renderiza): solo se clona. */
const templates = new WeakMap<THREE.Object3D, THREE.Object3D>();

export function templateOf(source: THREE.Object3D, body: BodyType): THREE.Object3D {
  const cached = templates.get(source);
  if (cached) return cached;
  const t = cloneSkinned(source);
  t.updateMatrixWorld(true);
  // La cresta se arma en reposo (antes de que el rig toque los huesos); el material es un molde.
  const buzzed = t.getObjectByName(buzzedMesh(body));
  if (buzzed instanceof THREE.SkinnedMesh) {
    attachCrest(buzzed, new THREE.MeshStandardMaterial({ roughness: 0.85, flatShading: true }));
  }
  const bodies: THREE.SkinnedMesh[] = [];
  t.traverse((obj) => {
    if (!(obj instanceof THREE.SkinnedMesh)) return;
    obj.frustumCulled = false; // el bounding box de bind no sigue la pose (patada, estirada)
    const mat = Array.isArray(obj.material) ? obj.material[0] : obj.material;
    if (mat && isBody(mat)) {
      prepareBody(obj);
      bodies.push(obj);
    }
  });
  // Fuera del traverse: agrega grupos a la escena.
  for (const b of bodies) attachShoes(t, b);
  templates.set(source, t);
  return t;
}

export interface Instance {
  scene: THREE.Object3D;
  glbRig: GlbRig;
  /** Materiales propios de esta instancia (se liberan al desmontar). */
  materials: THREE.Material[];
}

/**
 * Clon del template con materiales propios: el del cuerpo con los uniforms del kit y una copia de
 * cada uno de los demás (pelo, cresta, botines se tiñen por instancia). Se respeta el material
 * compartido (pelo y cejas usan el mismo).
 */
export function instantiate(template: THREE.Object3D, uniforms: KitUniforms): Instance {
  const scene = cloneSkinned(template);
  const own = new Map<THREE.Material, THREE.Material>();
  const copy = (m: THREE.Material) => {
    const c = own.get(m) ?? (isBody(m) ? kitMaterial(m, uniforms) : m.clone());
    own.set(m, c);
    return c;
  };
  scene.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    obj.material = Array.isArray(obj.material) ? obj.material.map(copy) : copy(obj.material);
  });
  const glbRig = createGlbRig(scene);
  // Nace posada: rig en reposo (brazos abajo) aplicado a los huesos YA, sin esperar un frame.
  driveGlbRig(glbRig, createProxies(), null);
  return { scene, glbRig, materials: [...own.values()] };
}

/** Peinado visible + tinte (los materiales ya son de la instancia). */
export function applyHair(scene: THREE.Object3D, mesh: string | null, crest: boolean, color: HexColor): void {
  scene.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    if (obj.name === CREST_NAME) {
      obj.visible = crest;
      if (obj.material instanceof THREE.MeshStandardMaterial) obj.material.color.set(color).multiplyScalar(CREST_SHADE);
      return;
    }
    if (HAIR_MESHES.includes(obj.name)) obj.visible = obj.name === mesh;
    if (obj.material instanceof THREE.MeshStandardMaterial && obj.material.name.startsWith("MI_Hair")) {
      obj.material.color.set(color);
    }
  });
}

export const withMeshopt = (loader: GLTFLoader) => {
  loader.setMeshoptDecoder(MeshoptDecoder);
};

export const BODIES: readonly BodyType[] = ["male", "female"];

/** Uniforms del kit de una instancia (colores y cortes; se mutan sin recompilar el shader). */
export function createUniforms(): KitUniforms {
  return {
    uTop: { value: new THREE.Color() },
    uSash: { value: new THREE.Color() },
    uSashOn: { value: 0 },
    uBottom: { value: new THREE.Color() },
    uShoes: { value: new THREE.Color() },
    uSleeveX: { value: 0 },
    uHemY: { value: 0 },
  };
}

/** Pivotes fantasma del rig (fuera de la escena; solo guardan la pose). En reposo = brazos abajo. */
export function createProxies(): ProxyRig {
  const root = new THREE.Group();
  root.position.y = ROOT_PIVOT_Y;
  const proxies = { root } as ProxyRig;
  for (const j of JOINTS) proxies[j] = new THREE.Group();
  return proxies;
}

