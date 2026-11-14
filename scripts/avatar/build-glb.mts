/**
 * Pipeline de los personajes 3D (Fase 6b). Toma los packs CC0 de Quaternius ya descomprimidos y
 * genera los GLB livianos que sirve la app en `public/models/avatar/`:
 *
 *   avatar-male.glb / avatar-female.glb  cuerpo + ojos + cejas + los 5 peinados (mismo esqueleto)
 *
 * Sin animaciones de UAL: el rig propio (`lib/avatar/rig.ts`) anima los huesos directamente.
 *
 *   pnpm avatar:build <dir-de-descarga>
 *
 * `<dir>` contiene `universal-base-characters/` tal cual salen del
 * zip. Texturas: se achican con PIL (python3) y van en JPEG/PNG chico; geometría con meshopt.
 * Los assets fuente NO se versionan (pesan ~170 MB); el resultado sí.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Document, NodeIO, type Texture } from "@gltf-transform/core";
import { ALL_EXTENSIONS, EXTMeshoptCompression } from "@gltf-transform/extensions";
import { dedup, meshopt, prune, quantize } from "@gltf-transform/functions";
import { MeshoptDecoder, MeshoptEncoder } from "meshoptimizer";

const src = process.argv[2];
if (!src) throw new Error("uso: pnpm avatar:build <dir-de-descarga>");
const root = join(import.meta.dirname, "..", "..");
const out = join(root, "public", "models", "avatar");
mkdirSync(out, { recursive: true });

await MeshoptDecoder.ready;
await MeshoptEncoder.ready;
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ "meshopt.decoder": MeshoptDecoder, "meshopt.encoder": MeshoptEncoder });

const UBC = join(src, "universal-base-characters", "Universal Base Characters[Standard]");
const BODY_DIR = join(UBC, "Base Characters", "Godot - UE");
const HAIR_DIR = join(UBC, "Hairstyles", "Rigged to Head Bone", "glTF (Godot -Unreal)");

/** Peinados del pack que mapean a los `hair.part` del avatar (ver `components/avatar/GlbAvatar`). */
const HAIRS = ["Hair_SimpleParted", "Hair_Long", "Hair_Buzzed", "Hair_BuzzedFemale", "Hair_Buns"] as const;

const work = mkdtempSync(join(tmpdir(), "tanda-avatar-"));
const resizer = join(work, "resize.py");
writeFileSync(
  resizer,
  [
    "import sys",
    "from PIL import Image",
    "src, dst, size, fmt = sys.argv[1], sys.argv[2], int(sys.argv[3]), sys.argv[4]",
    "im = Image.open(src)",
    "im = im.convert('RGB') if fmt == 'JPEG' else im",
    "im = im.resize((size, size), Image.LANCZOS)",
    "im.save(dst, fmt, quality=82, optimize=True)",
  ].join("\n"),
);

let n = 0;
function shrink(tex: Texture, size: number, jpeg: boolean): void {
  const img = tex.getImage();
  if (!img) return;
  const a = join(work, `in-${n}`);
  const b = join(work, `out-${n++}`);
  writeFileSync(a, img);
  execFileSync("python3", ["-I", resizer, a, b, String(size), jpeg ? "JPEG" : "PNG"]);
  tex.setImage(new Uint8Array(readFileSync(b))).setMimeType(jpeg ? "image/jpeg" : "image/png");
  tex.setURI("");
}

/** Igualdad de matrices/arrays numéricos con tolerancia (el pack exporta floats con ruido). */
function close(a: ArrayLike<number>, b: ArrayLike<number>, eps = 1e-4): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (Math.abs(a[i]! - b[i]!) > eps) return false;
  return true;
}

async function finish(doc: Document, file: string): Promise<void> {
  await doc.transform(dedup(), prune(), quantize(), meshopt({ encoder: MeshoptEncoder, level: "medium" }));
  doc.createExtension(EXTMeshoptCompression).setRequired(true);
  await io.write(join(out, file), doc);
  console.log(`✓ ${file} ${(statSync(join(out, file)).size / 1024).toFixed(0)} KB`);
}

for (const body of ["Male", "Female"] as const) {
  const doc = await io.read(join(BODY_DIR, `Superhero_${body}_FullBody.gltf`));
  const r = doc.getRoot();
  const skin = r.listSkins()[0]!;
  const armature = r.listScenes()[0]!.listChildren()[0]!;

  // Peinados: se copian sus mallas y se atan al MISMO skin del cuerpo (mismos huesos, mismo orden).
  for (const hair of HAIRS) {
    const hdoc = await io.read(join(HAIR_DIR, `${hair}.gltf`));
    const hskin = hdoc.getRoot().listSkins()[0]!;
    const names = hskin.listJoints().map((j) => j.getName());
    if (names.join() !== skin.listJoints().map((j) => j.getName()).join()) throw new Error(`${hair}: esqueleto distinto`);
    // Se re-ata al skin del cuerpo: el bind (inversas) y la transformación del nodo tienen que ser
    // los mismos, si no el pelo queda corrido o deformado sin ningún error.
    const ibm = hskin.getInverseBindMatrices()?.getArray();
    const bodyIbm = skin.getInverseBindMatrices()?.getArray();
    if (!ibm || !bodyIbm || !close(ibm, bodyIbm)) throw new Error(`${hair}: bind distinto del cuerpo`);
    const hnode = hdoc.getRoot().listNodes().find((x) => x.getMesh())!;
    const bodyNode = r.listNodes().find((x) => x.getMesh() && x.getSkin() === skin);
    if (!bodyNode || !close(hnode.getWorldMatrix(), bodyNode.getWorldMatrix())) throw new Error(`${hair}: nodo con otra transformación`);
    const hmesh = hnode.getMesh()!;
    const mesh = doc.createMesh(hair);
    for (const hp of hmesh.listPrimitives()) {
      const p = doc.createPrimitive();
      for (const sem of hp.listSemantics()) {
        const acc = hp.getAttribute(sem)!;
        p.setAttribute(sem, doc.createAccessor().setType(acc.getType()).setArray(acc.getArray()!.slice()).setNormalized(acc.getNormalized()));
      }
      const idx = hp.getIndices();
      if (idx) p.setIndices(doc.createAccessor().setType("SCALAR").setArray(idx.getArray()!.slice()));
      // Material del pelo del cuerpo (misma textura gris tintable); se tiñe en runtime.
      p.setMaterial(r.listMaterials().find((m) => m.getName().startsWith("MI_Hair")) ?? null);
      mesh.addPrimitive(p);
    }
    armature.addChild(doc.createNode(hair).setMesh(mesh).setSkin(skin));
  }

  for (const tex of r.listTextures()) {
    const name = tex.getName();
    if (/Roughness/i.test(name)) continue; // se poda abajo
    if (/Normal/i.test(name)) shrink(tex, /Superhero/.test(name) ? 512 : 128, false);
    else shrink(tex, /Superhero/.test(name) ? 1024 : 256, true);
  }
  for (const m of r.listMaterials()) {
    m.setMetallicRoughnessTexture(null).setRoughnessFactor(0.75).setMetallicFactor(0);
    if (m.getName().startsWith("MI_Hair")) m.setNormalTexture(null);
  }
  await finish(doc, `avatar-${body.toLowerCase()}.glb`);
}

rmSync(work, { recursive: true, force: true });

writeFileSync(
  join(out, "LICENSE.txt"),
  "Personajes: Quaternius (https://quaternius.com) — Universal Base Characters.\n" +
    "Licencia CC0 1.0 (dominio público). Procesados con\n" +
    "scripts/avatar/build-glb.mts (texturas reducidas, meshopt).\n",
);
