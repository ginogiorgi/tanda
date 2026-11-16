/**
 * Avatar con los personajes CC0 de Quaternius (Fase 6b): cuerpo + peinados en el mismo esqueleto (ver
 * `scripts/avatar/build-glb.mts`), animado con el rig propio (`lib/avatar/rig.ts`). La lógica three
 * pura (template, kit, pelo, botines) vive en `glbModel.ts`; acá solo el pegamento con R3F.
 *
 * - **Carga:** el GLB ya está en memoria cuando esto se monta (lo garantiza `useGlbReady` en el viewer,
 *   afuera del canvas). Sin Suspense ni fallback 3D (feedback 2: nunca el muñeco viejo).
 * - **Rig:** registra pivotes "fantasma" (Groups fuera de la escena) con los nombres del rig, así
 *   `applyPose` funciona igual; por frame se traducen a huesos con `glbRig`.
 * - **Pose:** la instancia nace posada (`instantiate`); nunca se ve el bind (T-pose) del pack.
 */

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import type * as THREE from "three";
import { JOINTS } from "@/lib/avatar/rig";
import { hairMesh } from "@/lib/avatar/catalog";
import type { AvatarV2 } from "@/lib/avatar/schema";
import type { HexColor } from "@/lib/avatar/types";
import { setShoes } from "./glbShoes";
import { loadedGlb } from "./glbLoad";
import {
  applyHair,
  createHairUniforms,
  createProxies,
  createUniforms,
  HALF_HEIGHT,
  instantiate,
  setKit,
  templateOf,
} from "./glbModel";
import { driveGlbRig } from "./glbRig";
import { ROOT_PIVOT_Y, type RigRegister } from "./rigPose";

interface GlbAvatarProps {
  config: AvatarV2;
  /** Color de camiseta de la selección (escena de penal): pisa el `kit.shirt` del avatar. */
  kitTop?: HexColor;
  /** Segundo color de la camiseta: banda diagonal. */
  kitSash?: HexColor;
  /** Registro de pivotes del rig (la escena le aplica poses con `applyPose`). */
  rig?: RigRegister;
  /** Pies en y=0 (escena) en vez de centrado vertical (creador). */
  grounded?: boolean;
}

export function GlbAvatar({ config, kitTop, kitSash, rig, grounded = false }: GlbAvatarProps) {
  const gltf = loadedGlb(config.body);
  const topColor = kitTop ?? config.kit.shirt;
  const sash = kitTop && kitSash && kitSash !== kitTop ? kitSash : null;

  const uniforms = useMemo(() => createUniforms(), []);
  const hairUniforms = useMemo(() => createHairUniforms(), []);
  const inst = useMemo(
    () => instantiate(templateOf(gltf.scene, config.body), uniforms, hairUniforms),
    [gltf, uniforms, hairUniforms], // eslint-disable-line react-hooks/exhaustive-deps -- `gltf` ya depende del cuerpo
  );
  useEffect(() => () => inst.materials.forEach((m) => m.dispose()), [inst]);

  // Pivotes fantasma para `applyPose` (no están en la escena; solo guardan la pose).
  const proxies = useMemo(() => createProxies(), []);

  // Colores, cortes, peinado, botines y registro del rig en UN layout effect, y recién al final el
  // frame (con frameloop "demand" es el único): así el primer frame ya tiene la pose de la escena.
  const invalidate = useThree((s) => s.invalidate);
  const { body, skin, hair, kit, boots } = config;
  const hairName = hairMesh(hair.style, body);
  useLayoutEffect(() => {
    setKit(uniforms, { body, skin, top: topColor, sash, bottom: kit.shorts, shoes: boots.color });
    applyHair(inst.scene, hairUniforms, hairName, hair.color);
    setShoes(inst.scene, "cleats", boots.color);
    invalidate();
  }, [inst, uniforms, invalidate, body, skin, topColor, sash, kit.shorts, boots.color, hairUniforms, hairName, hair.color]);

  useLayoutEffect(() => {
    if (!rig) return;
    rig("root", proxies.root);
    for (const j of JOINTS) rig(j, proxies[j]);
    invalidate();
    return () => {
      rig("root", null);
      for (const j of JOINTS) rig(j, null);
    };
  }, [rig, proxies, invalidate]);

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
