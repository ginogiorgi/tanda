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
import { HAIR_MESHES } from "@/lib/avatar/catalog";
import type { BodyType, HexColor } from "@/lib/avatar/types";
import { attachShoes } from "./glbShoes";
import { createGlbRig, dominantBone, driveGlbRig, type GlbRig, type ProxyRig } from "./glbRig";
import { ROOT_PIVOT_Y } from "./rigPose";

export const GLB_URL: Record<BodyType, string> = {
  male: "/models/avatar/avatar-male.glb",
  female: "/models/avatar/avatar-female.glb",
};

/**
 * Ajuste de un peinado a otra cabeza: escala uniforme alrededor del hueso `head` + corrimiento (m),
 * en reposo. Valores elegidos con el barrido de cobertura (asoma ≤ lo mismo que en su cuerpo nativo).
 */
export const HAIR_FIT: Partial<Record<BodyType, Partial<Record<string, { scale: number; dy: number }>>>> = {
  male: { Hair_Long: { scale: 1.15, dy: 0.02 }, Hair_Buns: { scale: 1.15, dy: 0.02 } },
};

/** Aplica `HAIR_FIT` a la geometría de los peinados del template (en reposo, antes de clonar). */
function fitHair(scene: THREE.Object3D, body: BodyType): void {
  const fits = HAIR_FIT[body];
  if (!fits) return;
  const head = scene.getObjectByName("Head");
  if (!head) return;
  const center = head.getWorldPosition(new THREE.Vector3());
  for (const [name, fit] of Object.entries(fits)) {
    const mesh = scene.getObjectByName(name);
    if (!(mesh instanceof THREE.SkinnedMesh) || !fit) continue;
    // Las posiciones vienen cuantizadas y el skinning (boneInverse) las lleva al mundo: por vértice
    // se arma su matriz de skinning A = Σ wₖ·Bₖ, se transforma en mundo y se vuelve con A⁻¹.
    const g = mesh.geometry.clone();
    const src = g.getAttribute("position");
    const si = g.getAttribute("skinIndex");
    const sw = g.getAttribute("skinWeight");
    const { bones, boneInverses } = mesh.skeleton;
    const boneMats = bones.map((b, k) => new THREE.Matrix4().multiplyMatrices(b.matrixWorld, boneInverses[k]!));
    const out = new Float32Array(src.count * 3);
    const v = new THREE.Vector3();
    const a = new THREE.Matrix4();
    const tmp = new THREE.Matrix4();
    for (let i = 0; i < src.count; i++) {
      a.makeScale(0, 0, 0);
      a.elements[15] = 0;
      for (let k = 0; k < 4; k++) {
        const w = sw.getComponent(i, k);
        if (w === 0) continue;
        tmp.copy(boneMats[si.getComponent(i, k)]!);
        for (let e = 0; e < 16; e++) a.elements[e]! += tmp.elements[e]! * w;
      }
      const world = mesh.matrixWorld.clone().multiply(mesh.bindMatrixInverse).multiply(a).multiply(mesh.bindMatrix);
      v.fromBufferAttribute(src, i).applyMatrix4(world);
      v.sub(center).multiplyScalar(fit.scale).add(center);
      v.y += fit.dy;
      v.applyMatrix4(world.invert());
      out.set([v.x, v.y, v.z], i * 3);
    }
    g.setAttribute("position", new THREE.BufferAttribute(out, 3));
    g.computeBoundingSphere();
    mesh.geometry = g;
  }
}

/**
 * Tinte del pelo por LUMINANCIA (P7a): antes `material.color` multiplicaba una textura gris (~0,6) y
 * todo salía oscuro (el blanco, gris). Ahora el color elegido es el que se ve y la textura solo
 * aporta el detalle (mechones) alrededor de su luminancia media. Las cejas, mismo tinte más oscuro.
 */
const HAIR_TEX_MID = 0.32; // luminancia lineal media de la textura gris del pack
const BROW_SHADE = 0.7;

export interface HairUniforms {
  uHair: { value: THREE.Color };
}

function hairMaterial(base: THREE.Material, u: HairUniforms, shade: number): THREE.Material {
  const m = base.clone();
  if (m instanceof THREE.MeshStandardMaterial) m.color.set("#ffffff");
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, u);
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform vec3 uHair;")
      .replace(
        "#include <map_fragment>",
        [
          "#include <map_fragment>",
          "float hl = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));",
          `diffuseColor.rgb = uHair * ${shade.toFixed(3)} * clamp(hl / ${HAIR_TEX_MID.toFixed(3)}, 0.55, 1.35);`,
        ].join("\n"),
      );
  };
  m.customProgramCacheKey = () => `tanda-hair-${shade}`;
  return m;
}

/** Mitad de la altura (~1.85 m) para centrar en el creador; en la escena va `grounded`. */
export const HALF_HEIGHT = 0.92;

/**
 * Cortes medidos sobre el bind normalizado (T-pose, pies en 0, 1.85 m). Brazos: solo por encima
 * de y≈1.39; torso hasta |x| 0.21 (H) / 0.16 (M). v2: el equipo es siempre remera de manga corta +
 * short (las variantes de manga/pantalón de v1 se fueron con el catálogo único).
 */
const SLEEVE_X: Record<BodyType, number> = { male: 0.32, female: 0.28 };
/**
 * Cuello redondo de la remera: superficie `y = y0 − tilt·dz + curv·dx²` (dz, dx desde el eje del
 * cuello, z = −0.035): más baja adelante (+z) y curvada hacia los costados. Por encima, y a menos de
 * `r` del eje, es piel. Antes era "piel = vértice del hueso neck/head": ese borde sigue los triángulos
 * y en el hombre quedaba dentado (serrucho). Medido en el bind: el cuello mide r≈0.06–0.1 en y 1.54–1.6.
 */
const COLLAR: Record<BodyType, { y: number; tilt: number; curv: number; r: number }> = {
  male: { y: 1.555, tilt: 0.25, curv: 3.5, r: 0.17 },
  female: { y: 1.54, tilt: 0.25, curv: 3.5, r: 0.15 },
};
/**
 * Corte del short (rodilla ≈0.54, cadera ≈0.97 en el modelo). Más largo que medio muslo: tapa la
 * ropa interior que trae pintada la textura del pack.
 */
const SHORT_HEM_Y = 0.66;
/** Luminancia lineal media (mediana) de la textura de piel del pack (M 0,208 · F 0,221). */
const SKIN_TEX_MID = 0.214;

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
  uSkin: { value: THREE.Color };
  uSleeveX: { value: number };
  uHemY: { value: number };
  /** (y0, inclinación, curvatura, radio) del cuello; ver `COLLAR`. */
  uCollar: { value: THREE.Vector4 };
}

export interface Kit {
  body: BodyType;
  skin: HexColor;
  top: HexColor;
  /** Segundo color de la camiseta de la nación (banda diagonal); `null` = lisa. */
  sash: HexColor | null;
  bottom: HexColor;
  shoes: HexColor;
}

export function setKit(u: KitUniforms, { body, skin, top, sash, bottom, shoes }: Kit): void {
  u.uSleeveX.value = SLEEVE_X[body];
  u.uHemY.value = SHORT_HEM_Y;
  const c = COLLAR[body];
  u.uCollar.value.set(c.y, c.tilt, c.curv, c.r);
  u.uSkin.value.set(skin);
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
        "#include <common>\nuniform vec3 uTop;\nuniform vec3 uSash;\nuniform float uSashOn;\nuniform vec3 uBottom;\nuniform vec3 uShoes;\nuniform vec3 uSkin;\nuniform float uSleeveX;\nuniform float uHemY;\nuniform vec4 uCollar;\nvarying float vHead;\nvarying vec3 vBind;",
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
          // cuello: plano inclinado cerca del eje (corte liso); la cabeza, por hueso, bien arriba del corte
          "vec2 nk = vec2(vBind.x, vBind.z + 0.035);",
          "float collarY = uCollar.x - uCollar.y * nk.y + uCollar.z * nk.x * nk.x;",
          "if (vBind.y > collarY && length(nk) < uCollar.w) region = 0;",
          "if (vHead > 0.5 && vBind.y > collarY + 0.04) region = 0;",
          // piel: tinte por luminancia (el tono elegido es el que se ve; la textura aporta el detalle)
          "if (region == 0) {",
          "  float sl = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));",
          // detalle comprimido (pow) y acotado: sin esto la cara (más clara que la mediana) lavaba los tonos
          // claros y los oscuros cerraban del todo
          `  diffuseColor.rgb = uSkin * clamp(pow(sl / ${SKIN_TEX_MID.toFixed(3)}, 0.6), 0.7, 1.2);`,
          // compensa el tone mapping (ACES desatura los claros y cierra los oscuros): +30% de
          // saturación y un leve lift → el tono elegido en la paleta es el que se lee en pantalla
          "  float cl = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));",
          "  diffuseColor.rgb = pow(max(mix(vec3(cl), diffuseColor.rgb, 1.3), 0.0), vec3(0.9));",
          "} else {",
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
const isHair = (m: THREE.Material) => m.name.startsWith("MI_Hair");

/** GLB → clon preparado (en reposo, nunca se anima ni se renderiza): solo se clona. */
const templates = new WeakMap<THREE.Object3D, THREE.Object3D>();

export function templateOf(source: THREE.Object3D, body: BodyType): THREE.Object3D {
  const cached = templates.get(source);
  if (cached) return cached;
  const t = cloneSkinned(source);
  t.updateMatrixWorld(true);
  fitHair(t, body);
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
 * cada uno de los demás (pelo, cejas y botines se tiñen por instancia).
 */
export function instantiate(
  template: THREE.Object3D,
  uniforms: KitUniforms,
  hairUniforms: HairUniforms = createHairUniforms(),
): Instance {
  const scene = cloneSkinned(template);
  // Pelo y cejas comparten material en el pack: acá se separan (las cejas van más oscuras).
  const own = new Map<string, THREE.Material>();
  const copy = (m: THREE.Material, meshName: string) => {
    const hair = isHair(m);
    const brow = meshName === "Eyebrows";
    const k = hair ? `${m.uuid}:${brow ? "brow" : "hair"}` : m.uuid;
    const c =
      own.get(k) ??
      (isBody(m) ? kitMaterial(m, uniforms) : hair ? hairMaterial(m, hairUniforms, brow ? BROW_SHADE : 1) : m.clone());
    own.set(k, c);
    return c;
  };
  scene.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    obj.material = Array.isArray(obj.material)
      ? obj.material.map((m) => copy(m, obj.name))
      : copy(obj.material, obj.name);
  });
  const glbRig = createGlbRig(scene);
  // Nace posada: rig en reposo (brazos abajo) aplicado a los huesos YA, sin esperar un frame.
  driveGlbRig(glbRig, createProxies(), null);
  return { scene, glbRig, materials: [...own.values()] };
}

/** Peinado visible + tinte (pelo y cejas leen `uHair`; los materiales ya son de la instancia). */
export function applyHair(scene: THREE.Object3D, hairUniforms: HairUniforms, mesh: string | null, color: HexColor): void {
  hairUniforms.uHair.value.set(color);
  scene.traverse((obj) => {
    if (obj instanceof THREE.Mesh && (HAIR_MESHES as readonly string[]).includes(obj.name)) obj.visible = obj.name === mesh;
  });
}

export function createHairUniforms(): HairUniforms {
  return { uHair: { value: new THREE.Color() } };
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
    uSkin: { value: new THREE.Color() },
    uSleeveX: { value: 0 },
    uHemY: { value: 0 },
    uCollar: { value: new THREE.Vector4() },
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

