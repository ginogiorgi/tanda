/**
 * Avatar con los personajes CC0 de Quaternius (Fase 6b): carga `public/models/avatar/avatar-*.glb`
 * (cuerpo + peinados en el mismo esqueleto, ver `scripts/avatar/build-glb.mts`) y lo anima con el
 * rig propio (`lib/avatar/rig.ts`). Misma API que `AvatarModel` → se intercambian sin tocar escenas.
 *
 * - **Rig:** registra pivotes "fantasma" (Groups fuera de la escena) con los nombres del rig, así
 *   `applyPose` funciona igual; por frame se traducen a huesos con `lib/avatar/glbRig`.
 * - **Ropa:** sin mallas de ropa. El shader decide la región (piel/remera/short/botines) por
 *   fragmento con planos sobre la posición en bind (T-pose) → cortes rectos; el corte de ropa
 *   (largo de manga, short o pantalón) va por uniforms.
 * - **Pelo:** se muestra el peinado de `hair.part` y se tiñe (textura gris del pack).
 *
 * Requiere `<Suspense>` arriba (useLoader). La preparación pesada (geometría del cuerpo, cresta,
 * botines) se hace una vez por GLB (`templateOf`); cada instancia clona el template y crea solo sus
 * materiales (colores propios), que libera al desmontarse.
 */

import { useFrame, useLoader, useThree } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import { JOINTS } from "@/lib/avatar/rig";
import type { AvatarConfig, BodyType, HexColor } from "@/lib/avatar/types";
import { attachCrest, CREST_NAME } from "./glbCrest";
import { attachShoes, setShoes } from "./glbShoes";
import { createGlbRig, dominantBone, driveGlbRig, type GlbRig, type ProxyRig } from "./glbRig";
import { ROOT_PIVOT_Y, type RigRegister } from "./rigPose";

const URL: Record<BodyType, string> = {
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

function hairMesh(part: string, body: BodyType): string | null {
  if (part === "buzz" || part === "mohawk") return buzzedMesh(body);
  return HAIR_MESH[part] ?? null;
}

/**
 * La textura del pelo es gris (~0.6) y se tiñe multiplicando: la cresta, sin textura, usa el color
 * atenuado para que pegue con el rapado.
 */
const CREST_SHADE = 0.62;

/** Mitad de la altura (~1.85 m) para centrar en el creador; en la escena va `grounded`. */
const HALF_HEIGHT = 0.92;

interface Outfit {
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

function outfitOf(config: AvatarConfig): Outfit {
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

interface KitUniforms {
  uTop: { value: THREE.Color };
  uSash: { value: THREE.Color };
  uSashOn: { value: number };
  uBottom: { value: THREE.Color };
  uShoes: { value: THREE.Color };
  uSleeveX: { value: number };
  uHemY: { value: number };
}

function setKit(u: KitUniforms, o: Outfit, top: HexColor, sash: HexColor | null, bottom: HexColor, shoes: HexColor): void {
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

function templateOf(source: THREE.Object3D, body: BodyType): THREE.Object3D {
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

interface Instance {
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
function instantiate(template: THREE.Object3D, uniforms: KitUniforms): Instance {
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
  return { scene, glbRig: createGlbRig(scene), materials: [...own.values()] };
}

/** Peinado visible + tinte (los materiales ya son de la instancia). */
function applyHair(scene: THREE.Object3D, mesh: string | null, crest: boolean, color: HexColor): void {
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

interface GlbAvatarProps {
  config: AvatarConfig;
  /** Color de camiseta de la selección (escena de penal). Ver `AvatarModel`. */
  kitTop?: HexColor;
  /** Segundo color de la camiseta: banda diagonal. */
  kitSash?: HexColor;
  /** Registro de pivotes del rig (mismo contrato que `AvatarModel`). */
  rig?: RigRegister;
  /** Pies en y=0 (escena) en vez de centrado vertical (creador). */
  grounded?: boolean;
}

const withMeshopt = (loader: GLTFLoader) => {
  loader.setMeshoptDecoder(MeshoptDecoder);
};
const BODIES: BodyType[] = ["male", "female"];

/**
 * Arranca la descarga + parseo de los dos GLB sin montar nada (precarga mientras esperás en la sala o
 * la cola, F4): cuando abre el primer penal ya están en la caché de `useLoader`.
 */
export function preloadGlbBodies(): void {
  for (const b of BODIES) useLoader.preload(GLTFLoader, URL[b], withMeshopt);
}

/**
 * Para el creador (donde se cambia de cuerpo): baja los dos GLB y arma sus templates por adelantado,
 * así el cambio de cuerpo no cae al fallback procedural ni paga `templateOf` en el momento. No dibuja
 * nada; va en su propio `<Suspense fallback={null}>` para no frenar al avatar visible.
 */
export function WarmGlbBodies() {
  // Un `useLoader` por URL (misma clave de caché que `GlbAvatar`; con un array sería otra entrada y
  // se parsearía dos veces). El preload arranca las dos descargas en paralelo.
  preloadGlbBodies();
  const male = useLoader(GLTFLoader, URL.male, withMeshopt);
  const female = useLoader(GLTFLoader, URL.female, withMeshopt);
  useMemo(() => {
    templateOf(male.scene, "male");
    templateOf(female.scene, "female");
  }, [male, female]);
  return null;
}

export function GlbAvatar({ config, kitTop, kitSash, rig, grounded = false }: GlbAvatarProps) {
  const gltf = useLoader(GLTFLoader, URL[config.bodyType], withMeshopt);
  const topColor = kitTop ?? config.top.color;
  const sash = kitTop && kitSash && kitSash !== kitTop ? kitSash : null;

  const uniforms = useMemo<KitUniforms>(
    () => ({
      uTop: { value: new THREE.Color() },
      uSash: { value: new THREE.Color() },
      uSashOn: { value: 0 },
      uBottom: { value: new THREE.Color() },
      uShoes: { value: new THREE.Color() },
      uSleeveX: { value: 0 },
      uHemY: { value: 0 },
    }),
    [],
  );

  const inst = useMemo(() => instantiate(templateOf(gltf.scene, config.bodyType), uniforms), [gltf, uniforms]); // eslint-disable-line react-hooks/exhaustive-deps -- `gltf` ya depende del cuerpo
  useEffect(() => () => inst.materials.forEach((m) => m.dispose()), [inst]);

  // Colores, cortes, peinado y botines: se mutan uniforms/materiales (sin reclonar ni recompilar) y
  // se pide un frame (con frameloop "demand" nada más lo dibujaría).
  const invalidate = useThree((s) => s.invalidate);
  const { sleeveX, hemY } = outfitOf(config);
  const hairName = hairMesh(config.hair.part, config.bodyType);
  const { hair, bottom, shoes } = config;
  useLayoutEffect(() => {
    setKit(uniforms, { sleeveX, hemY }, topColor, sash, bottom.color, shoes.color);
    applyHair(inst.scene, hairName, hair.part === "mohawk", hair.color);
    setShoes(inst.scene, shoes.part, shoes.color);
    invalidate();
  }, [inst, uniforms, invalidate, sleeveX, hemY, topColor, sash, bottom.color, shoes.part, shoes.color, hairName, hair.part, hair.color]);

  // Pivotes fantasma para `applyPose` (no están en la escena; solo guardan la pose).
  const proxies = useMemo<ProxyRig>(() => {
    const root = new THREE.Group();
    root.position.y = ROOT_PIVOT_Y; // sin rig (vista estática) queda en la pose de reposo
    const g = () => new THREE.Group();
    return {
      root,
      hips: g(),
      spine: g(),
      head: g(),
      shoulderL: g(),
      shoulderR: g(),
      elbowL: g(),
      elbowR: g(),
      hipL: g(),
      hipR: g(),
      kneeL: g(),
      kneeR: g(),
    };
  }, []);
  // Layout effect (no pasivo): si el avatar vuelve a suspenderse (cambio de cuerpo sin GLB en caché),
  // React lo des-registra al ocultarlo y lo vuelve a registrar al mostrarlo, después de que el
  // fallback (`AvatarModel`) borre sus pivotes.
  useLayoutEffect(() => {
    if (!rig) return;
    rig("root", proxies.root);
    for (const j of JOINTS) rig(j, proxies[j]);
    return () => {
      rig("root", null);
      for (const j of JOINTS) rig(j, null);
    };
  }, [rig, proxies]);

  const wrapper = useRef<THREE.Group>(null);
  // Corre después del `applyPose` de la escena (que usa prioridad -1): la pose es la de este frame.
  useFrame(() => driveGlbRig(inst.glbRig, proxies, wrapper.current));

  return (
    <group position={[0, grounded ? 0 : -HALF_HEIGHT, 0]}>
      <group position={[0, ROOT_PIVOT_Y, 0]} ref={wrapper}>
        <group position={[0, -ROOT_PIVOT_Y, 0]}>
          <primitive object={inst.scene} />
        </group>
      </group>
    </group>
  );
}
