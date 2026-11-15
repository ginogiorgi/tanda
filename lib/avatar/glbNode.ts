/**
 * Carga los GLB del avatar en Node, SIN WebGL ni DOM (tests y QA geométrico). Las texturas se descartan
 * (cargarlas necesita `Image`/`createImageBitmap`); geometría, esqueleto, materiales y nombres quedan
 * idénticos a los del browser.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { MeshoptDecoder, MeshoptEncoder } from "meshoptimizer";
import type * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder as ThreeMeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import type { BodyType } from "./types";

export const GLB_FILE: Record<BodyType, string> = {
  male: join(process.cwd(), "public/models/avatar/avatar-male.glb"),
  female: join(process.cwd(), "public/models/avatar/avatar-female.glb"),
};

/** GLB del cuerpo → escena de three (sin texturas). */
export async function loadGlbScene(body: BodyType): Promise<THREE.Group> {
  await MeshoptDecoder.ready;
  await MeshoptEncoder.ready;
  const io = new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({ "meshopt.decoder": MeshoptDecoder, "meshopt.encoder": MeshoptEncoder });
  const doc = await io.readBinary(new Uint8Array(readFileSync(GLB_FILE[body])));
  for (const t of doc.getRoot().listTextures()) t.dispose();
  const bin = await io.writeBinary(doc);
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(ThreeMeshoptDecoder);
  const ab = bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength) as ArrayBuffer;
  const gltf = await loader.parseAsync(ab, "");
  return gltf.scene;
}
