/**
 * Descarga y caché de los GLB del avatar, FUERA de React y del `<Canvas>` (feedback 2, P2.1).
 *
 * Antes el GLB se pedía con `useLoader` adentro del canvas, con `<Suspense fallback={<AvatarModel/>}>`:
 * mientras bajaba se veía el muñeco procedural viejo y después "saltaba" al GLB. Ahora el canvas se
 * monta recién cuando los cuerpos que necesita están acá (ver `useGlbReady`); mientras tanto, un
 * placeholder neutro, y si falla, un error con reintento. Una promesa rechazada sale de la caché →
 * reintentar vuelve a pedir el archivo.
 */
import type * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { BodyType } from "@/lib/avatar/types";
import { BODIES, GLB_URL, withMeshopt } from "./glbModel";

type Gltf = { scene: THREE.Group };

const pending = new Map<BodyType, Promise<Gltf>>();
const loaded = new Map<BodyType, Gltf>();

function loadGlb(body: BodyType): Promise<Gltf> {
  const hit = pending.get(body);
  if (hit) return hit;
  const loader = new GLTFLoader();
  withMeshopt(loader);
  const p = loader.loadAsync(GLB_URL[body]).then((g) => {
    loaded.set(body, g);
    return g;
  });
  p.catch(() => pending.delete(body));
  pending.set(body, p);
  return p;
}

/** Resuelve cuando todos los cuerpos pedidos están cargados (rechaza si alguno falla). */
export async function loadGlbBodies(bodies: readonly BodyType[]): Promise<void> {
  await Promise.all(bodies.map(loadGlb));
}

/** Precarga sin esperar (sala, cola ranked, creador): errores silenciosos, se reintenta al montar. */
export function preloadGlbBodies(): void {
  for (const b of BODIES) loadGlb(b).catch(() => undefined);
}

/** GLB ya cargado. Solo se llama adentro de un canvas que montó `useGlbReady` con ese cuerpo listo. */
export function loadedGlb(body: BodyType): Gltf {
  const g = loaded.get(body);
  if (!g) throw new Error(`GLB ${body} sin cargar: montá el canvas con useGlbReady`);
  return g;
}
