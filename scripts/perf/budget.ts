/**
 * Presupuesto de JS por ruta (feedback 14/11, F4). Corre sobre la salida de `next build` (Turbopack):
 *
 *  - First Load JS de cada página = chunks raíz del framework + `entryJSFiles` de todos sus segmentos
 *    (layouts + page), del `page_client-reference-manifest.js`. Se mide en gzip.
 *  - Falla si una ruta supera su presupuesto (`budget.json`: línea de base + 5%).
 *  - Falla si `three` aparece en los chunks de ENTRADA de cualquier ruta: el 3D va siempre code-splitteado
 *    (se baja con `next/dynamic`/import() — y se precarga mientras esperás en sala o cola).
 *
 *   pnpm build && pnpm perf:budget            # chequea
 *   pnpm build && pnpm perf:budget --write    # regraba budget.json (línea de base + 5%)
 */
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { runInNewContext } from "node:vm";
import { gzipSync } from "node:zlib";

const NEXT = ".next";
const BUDGET_FILE = "scripts/perf/budget.json";
const SLACK = 1.05;
/** Marca inequívoca de three.js en un chunk minificado (nombre de clase que conserva el bundle). */
const THREE_MARKER = /WebGLRenderer|WebGLRenderTarget/;

interface Manifest {
  entryJSFiles: Record<string, string[]>;
}

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (name === "page_client-reference-manifest.js") out.push(p);
  }
  return out;
}

/** `/(game)/sala/[code]/page` → `/sala/[code]`. */
function routeOf(key: string): string {
  const segs = key.replace(/\/page$/, "").split("/").filter((s) => s && !/^\(.+\)$/.test(s));
  return `/${segs.join("/")}`;
}

const chunkCache = new Map<string, { gz: number; three: boolean }>();
function chunk(file: string): { gz: number; three: boolean } {
  const hit = chunkCache.get(file);
  if (hit) return hit;
  const buf = readFileSync(join(NEXT, file));
  const info = { gz: gzipSync(buf).length, three: THREE_MARKER.test(buf.toString("utf8")) };
  chunkCache.set(file, info);
  return info;
}

const buildManifest = JSON.parse(readFileSync(join(NEXT, "build-manifest.json"), "utf8")) as {
  rootMainFiles: string[];
};

const rows: { route: string; kb: number; three: string[] }[] = [];
for (const file of walk(join(NEXT, "server", "app"))) {
  const sandbox: { globalThis?: unknown; __RSC_MANIFEST?: Record<string, Manifest> } = {};
  sandbox.globalThis = sandbox;
  runInNewContext(readFileSync(file, "utf8"), sandbox);
  for (const [key, manifest] of Object.entries(sandbox.__RSC_MANIFEST ?? {})) {
    const route = routeOf(key);
    if (route.startsWith("/dev")) continue; // 404 en producción
    const files = new Set([...buildManifest.rootMainFiles, ...Object.values(manifest.entryJSFiles).flat()]);
    let gz = 0;
    const three: string[] = [];
    for (const f of files) {
      const c = chunk(f);
      gz += c.gz;
      if (c.three) three.push(f);
    }
    rows.push({ route, kb: Math.round((gz / 1024) * 10) / 10, three });
  }
}
rows.sort((a, b) => a.route.localeCompare(b.route));

if (rows.length === 0) {
  console.error(`✗ No encontré manifiestos en ${relative(".", join(NEXT, "server", "app"))}: ¿corriste pnpm build?`);
  process.exit(1);
}

const write = process.argv.includes("--write");
const budget: Record<string, number> = write
  ? {}
  : (JSON.parse(readFileSync(BUDGET_FILE, "utf8")) as Record<string, number>);

let failed = false;
for (const r of rows) {
  if (write) budget[r.route] = Math.ceil(r.kb * SLACK);
  const max = budget[r.route];
  const over = max != null && r.kb > max;
  const status = r.three.length ? "✗ three en la entrada" : over ? "✗ sobre presupuesto" : max == null ? "· sin presupuesto" : "✓";
  console.log(`${status.padEnd(24)} ${r.route.padEnd(22)} ${String(r.kb).padStart(7)} KB gz  (máx ${max ?? "—"})`);
  if (r.three.length) console.log(`    ${r.three.join(", ")}`);
  if (r.three.length || over || max == null) failed = true;
}

if (write) {
  writeFileSync(BUDGET_FILE, `${JSON.stringify(budget, null, 2)}\n`);
  console.log(`\nbudget.json regrabado (línea de base + ${Math.round((SLACK - 1) * 100)}%).`);
} else if (failed) {
  console.error("\n✗ Presupuesto de JS roto (o ruta nueva sin presupuesto: pnpm perf:budget --write y revisar el diff).");
  process.exit(1);
}
