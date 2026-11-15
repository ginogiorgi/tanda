/**
 * Chequeo de migraciones (feedback 2, P1). Dos ramas crearon `20261122000000` sin enterarse; y una
 * migración con versión MENOR a las ya aplicadas en prod corre en otro orden en local (`db reset`, por
 * versión) que en prod (por fecha de aplicación) → local ≠ prod. Falla si:
 *  - un archivo no respeta `<14 dígitos>_<nombre>.sql`;
 *  - hay dos versiones iguales;
 *  - una migración que no está en `origin/main` tiene versión ≤ a la máxima de `origin/main`
 *    (usar el próximo número libre al mergear);
 *  - desde `…24000002_game_timing` (P3), una migración tiene un tiempo de juego literal
 *    (`interval 'N second(s)'`): los tiempos salen de `public.game_timing()` (espejo de `TIMING`).
 *
 *   pnpm db:check-migrations      (CI: necesita `origin/main` fetcheado; sin él, solo los dos primeros)
 */
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const DIR = "supabase/migrations";
const RE = /^(\d{14})_[a-z0-9_]+\.sql$/;

const files = readdirSync(DIR).filter((f) => f.endsWith(".sql")).sort();
const errors: string[] = [];
const seen = new Map<string, string>();
for (const f of files) {
  const m = RE.exec(f);
  if (!m) {
    errors.push(`${f}: el nombre tiene que ser <14 dígitos>_<snake_case>.sql`);
    continue;
  }
  const prev = seen.get(m[1]!);
  if (prev) errors.push(`${f}: versión repetida con ${prev}`);
  seen.set(m[1]!, f);
}

/** Primera migración con los tiempos centralizados: de acá en adelante, ningún literal de segundos. */
const TIMING_FROM = "20261124000002";
const LITERAL_SECONDS = /interval\s+'\s*\d+(\.\d+)?\s*sec(ond)?s?\s*'/i;
for (const f of files) {
  if (!RE.test(f) || f.slice(0, 14) < TIMING_FROM) continue;
  const lines = readFileSync(join(DIR, f), "utf8").split("\n");
  lines.forEach((l, i) => {
    if (LITERAL_SECONDS.test(l.replace(/--.*$/, ""))) {
      errors.push(`${f}:${i + 1}: tiempo de juego literal → usá make_interval(secs => (public.game_timing()->>'<key>')::int)`);
    }
  });
}

let onMain: string[] | null = null;
try {
  onMain = execFileSync("git", ["ls-tree", "--name-only", "origin/main", `${DIR}/`], { encoding: "utf8" })
    .split("\n")
    .map((p) => p.replace(`${DIR}/`, ""))
    .filter((f) => RE.test(f));
} catch {
  console.warn("· sin origin/main: no se chequea el orden contra main");
}
if (onMain && onMain.length > 0) {
  const maxMain = onMain.map((f) => f.slice(0, 14)).sort().at(-1)!;
  for (const f of files) {
    if (!onMain.includes(f) && RE.test(f) && f.slice(0, 14) <= maxMain) {
      errors.push(`${f}: es nueva pero su versión no supera la última de main (${maxMain}) → renumerá al próximo libre`);
    }
  }
}

if (errors.length) {
  for (const e of errors) console.error(`✗ ${e}`);
  process.exit(1);
}
console.log(`✓ ${files.length} migraciones: nombres y versiones OK${onMain ? " (orden contra origin/main)" : ""}`);
