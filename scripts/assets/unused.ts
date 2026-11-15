/**
 * Assets huérfanos en `public/` (feedback 2, P2.4). knip no ve archivos estáticos y varios se referencian
 * por nombre armado en runtime (`/flags/${code}.svg`), así que el set "en uso" se arma desde las fuentes
 * reales: catálogo de equipos (`data/teams/*.json`), divisiones del motor, premios, GLB del avatar y el
 * manifest. Falla si sobra un archivo (asset muerto) o si falta uno referenciado (link roto).
 *
 *   pnpm assets:check
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { DIVISIONS } from "@/lib/engine/ranked";

const PUBLIC = "public";
/** Archivos que no son assets servidos por nombre (licencias). */
const IGNORE = /(^|\/)LICENSE[^/]*$/;

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(relative(PUBLIC, p));
  }
  return out;
}

const used = new Set<string>(["icon-192.png", "icon-512.png", "models/avatar/avatar-male.glb", "models/avatar/avatar-female.glb"]);
for (const f of readdirSync("data/teams")) {
  const teams = JSON.parse(readFileSync(join("data/teams", f), "utf8")) as { flag_asset: string | null; crest_asset: string | null }[];
  for (const t of teams) {
    if (t.flag_asset) used.add(`flags/${t.flag_asset}.svg`);
    if (t.crest_asset) used.add(`crests/${t.crest_asset}.svg`);
  }
}
for (const d of DIVISIONS) used.add(`crests/div/${d.id}.svg`);
for (const k of ["gold", "silver", "bronze"]) used.add(`cups/${k}.svg`);

const files = walk(PUBLIC).filter((f) => !IGNORE.test(f));
const orphans = files.filter((f) => !used.has(f));
const missing = [...used].filter((f) => !files.includes(f));

for (const f of orphans) console.error(`✗ sin uso: public/${f}`);
for (const f of missing) console.error(`✗ falta: public/${f} (referenciado)`);
if (orphans.length || missing.length) process.exit(1);
console.log(`✓ ${files.length} assets en public/, todos en uso`);
