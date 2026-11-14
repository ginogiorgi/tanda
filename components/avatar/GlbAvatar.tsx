/**
 * Avatar con los personajes CC0 de Quaternius (Fase 6b): carga `public/models/avatar/avatar-*.glb`
 * (cuerpo + peinados en el mismo esqueleto, ver `scripts/avatar/build-glb.mts`) y lo anima con el
 * rig propio (`lib/avatar/rig.ts`). Misma API que `AvatarModel` → se intercambian sin tocar escenas.
 *
 * - **Rig:** registra pivotes "fantasma" (Groups fuera de la escena) con los nombres del rig, así
 *   `applyPose` funciona igual; por frame se traducen a huesos con `lib/avatar/glbRig`.
 * - **Ropa:** sin mallas de ropa. Cada vértice del cuerpo recibe una región (piel/remera/short/
 *   botines) según su hueso dominante y altura en bind; el shader pinta la región con su color.
 * - **Pelo:** se muestra el peinado de `hair.part` y se tiñe (textura gris del pack).
 *
 * Requiere `<Suspense>` arriba (useLoader).
 */

import { useFrame, useLoader } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import { JOINTS } from "@/lib/avatar/rig";
import type { AvatarConfig, BodyType, HexColor } from "@/lib/avatar/types";
import { createGlbRig, driveGlbRig, type ProxyRig } from "./glbRig";
import { ROOT_PIVOT_Y, type RigRegister } from "./rigPose";

const URL: Record<BodyType, string> = {
  male: "/models/avatar/avatar-male.glb",
  female: "/models/avatar/avatar-female.glb",
};

/** `hair.part` → malla del pack. `mohawk` usa el rapado (la cresta propia queda pendiente). */
const HAIR_MESH: Record<string, string | null> = {
  none: null,
  short: "Hair_SimpleParted",
  long: "Hair_Long",
  bun: "Hair_Buns",
  mohawk: "Hair_Buzzed",
};
const HAIR_MESHES = ["Hair_SimpleParted", "Hair_Long", "Hair_Buzzed", "Hair_BuzzedFemale", "Hair_Buns"];

function hairMesh(part: string, body: BodyType): string | null {
  if (part === "buzz") return body === "female" ? "Hair_BuzzedFemale" : "Hair_Buzzed";
  return HAIR_MESH[part] ?? null;
}

/** Mitad de la altura (~1.85 m) para centrar en el creador; en la escena va `grounded`. */
const HALF_HEIGHT = 0.92;

const enum Region {
  Skin = 0,
  Top = 1,
  Bottom = 2,
  Shoes = 3,
}

interface Outfit {
  upperArm: boolean;
  foreArm: boolean;
  shorts: boolean;
}

function outfitOf(config: AvatarConfig): Outfit {
  const t = config.top.part;
  return {
    upperArm: t !== "tank",
    foreArm: t === "longsleeve",
    shorts: config.bottom.part === "shorts",
  };
}

/** Corte del short a mitad de muslo (rodilla ≈0.54, cadera ≈0.97 en el modelo). */
const SHORT_HEM_Y = 0.74;

function regionOf(bone: string, y: number, o: Outfit): Region {
  if (/^(foot|ball)_/.test(bone)) return Region.Shoes;
  if (/^calf_/.test(bone)) return o.shorts ? Region.Skin : Region.Bottom;
  if (/^thigh_/.test(bone)) return o.shorts && y < SHORT_HEM_Y ? Region.Skin : Region.Bottom;
  if (bone === "pelvis") return Region.Bottom;
  if (/^(spine_0\d|clavicle_)/.test(bone)) return Region.Top;
  if (/^upperarm_/.test(bone)) return o.upperArm ? Region.Top : Region.Skin;
  if (/^lowerarm_/.test(bone)) return o.foreArm ? Region.Top : Region.Skin;
  return Region.Skin;
}

/** Atributos `aRegion` (región por vértice) y `aBind` (posición en bind, espacio del modelo). */
function paintRegions(mesh: THREE.SkinnedMesh, o: Outfit): void {
  const g = mesh.geometry.clone();
  const pos = g.getAttribute("position");
  const si = g.getAttribute("skinIndex");
  const sw = g.getAttribute("skinWeight");
  const bones = mesh.skeleton.bones;
  const region = new Float32Array(pos.count);
  const bind = new Float32Array(pos.count * 3);
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).applyMatrix4(mesh.bindMatrix);
    bind.set([v.x, v.y, v.z], i * 3);
    let best = 0;
    let w = -1;
    for (let k = 0; k < 4; k++) {
      const wk = sw.getComponent(i, k);
      if (wk > w) {
        w = wk;
        best = si.getComponent(i, k);
      }
    }
    region[i] = regionOf(bones[best]?.name ?? "", v.y, o);
  }
  g.setAttribute("aRegion", new THREE.BufferAttribute(region, 1));
  g.setAttribute("aBind", new THREE.BufferAttribute(bind, 3));
  mesh.geometry = g;
}

interface KitUniforms {
  uTop: { value: THREE.Color };
  uSash: { value: THREE.Color };
  uSashOn: { value: number };
  uBottom: { value: THREE.Color };
  uShoes: { value: THREE.Color };
}

function setKitColors(u: KitUniforms, top: HexColor, sash: HexColor | null, bottom: HexColor, shoes: HexColor): void {
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
        "#include <common>\nattribute float aRegion;\nattribute vec3 aBind;\nvarying float vRegion;\nvarying vec3 vBind;",
      )
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvRegion = aRegion;\nvBind = aBind;");
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        "#include <common>\nuniform vec3 uTop;\nuniform vec3 uSash;\nuniform float uSashOn;\nuniform vec3 uBottom;\nuniform vec3 uShoes;\nvarying float vRegion;\nvarying vec3 vBind;",
      )
      .replace(
        "#include <map_fragment>",
        [
          "#include <map_fragment>",
          "if (vRegion > 0.5) {",
          "  vec3 c = vRegion < 1.5 ? uTop : (vRegion < 2.5 ? uBottom : uShoes);",
          // banda diagonal: hombro izquierdo (+X) → cadera derecha, solo en la remera y adelante
          "  float d = abs((vBind.y - 1.22) - 1.15 * vBind.x);",
          "  if (vRegion < 1.5 && uSashOn > 0.5 && d < 0.075) c = uSash;",
          "  diffuseColor.rgb = c;",
          "}",
        ].join("\n"),
      );
  };
  m.customProgramCacheKey = () => "tanda-kit";
  return m;
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

export function GlbAvatar({ config, kitTop, kitSash, rig, grounded = false }: GlbAvatarProps) {
  const gltf = useLoader(GLTFLoader, URL[config.bodyType], (loader) => {
    loader.setMeshoptDecoder(MeshoptDecoder);
  });
  const topColor = kitTop ?? config.top.color;
  const sash = kitTop && kitSash && kitSash !== kitTop ? kitSash : null;

  const uniforms = useMemo<KitUniforms>(
    () => ({
      uTop: { value: new THREE.Color() },
      uSash: { value: new THREE.Color() },
      uSashOn: { value: 0 },
      uBottom: { value: new THREE.Color() },
      uShoes: { value: new THREE.Color() },
    }),
    [],
  );

  const outfitKey = `${config.top.part}|${config.bottom.part}`;
  const { scene, glbRig } = useMemo(() => {
    const scene = cloneSkinned(gltf.scene);
    scene.updateMatrixWorld(true);
    const o = outfitOf(config);
    scene.traverse((obj) => {
      if (!(obj instanceof THREE.SkinnedMesh)) return;
      obj.frustumCulled = false; // el bounding box de bind no sigue la pose (patada, estirada)
      const mat = Array.isArray(obj.material) ? obj.material[0] : obj.material;
      if (!mat) return;
      if (mat.name.startsWith("MI_Superhero")) {
        paintRegions(obj, o);
        obj.material = kitMaterial(mat, uniforms);
      }
    });
    return { scene, glbRig: createGlbRig(scene) };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo cambia con el cuerpo y el corte de ropa
  }, [gltf, outfitKey, uniforms]);

  // Peinado visible + tinte (material propio del clon, compartido por pelo y cejas).
  const hairName = hairMesh(config.hair.part, config.bodyType);
  useMemo(() => {
    const tinted = new Map<THREE.Material, THREE.MeshStandardMaterial>();
    scene.traverse((obj) => {
      if (!(obj instanceof THREE.SkinnedMesh)) return;
      if (HAIR_MESHES.includes(obj.name)) obj.visible = obj.name === hairName;
      const mat = obj.material;
      if (mat instanceof THREE.MeshStandardMaterial && mat.name.startsWith("MI_Hair")) {
        const own = tinted.get(mat) ?? (mat.userData.tanda === true ? mat : mat.clone());
        own.userData.tanda = true;
        own.color.set(config.hair.color);
        tinted.set(mat, own);
        obj.material = own;
      }
    });
  }, [scene, hairName, config.hair.color]);

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
  useEffect(() => {
    if (!rig) return;
    rig("root", proxies.root);
    for (const j of JOINTS) rig(j, proxies[j]);
    return () => {
      rig("root", null);
      for (const j of JOINTS) rig(j, null);
    };
  }, [rig, proxies]);

  const wrapper = useRef<THREE.Group>(null);
  useFrame(() => {
    // Los colores cambian sin recompilar: se mutan los uniforms.
    setKitColors(uniforms, topColor, sash, config.bottom.color, config.shoes.color);
    driveGlbRig(glbRig, proxies, wrapper.current);
  });

  return (
    <group position={[0, grounded ? 0 : -HALF_HEIGHT, 0]}>
      <group position={[0, ROOT_PIVOT_Y, 0]} ref={wrapper}>
        <group position={[0, -ROOT_PIVOT_Y, 0]}>
          <primitive object={scene} />
        </group>
      </group>
    </group>
  );
}
