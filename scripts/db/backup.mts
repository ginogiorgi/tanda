/**
 * Backup propio de la DB de prod (Plan 5 O2): el plan free de Supabase no tiene backups automáticos.
 * Exporta TODAS las tablas de `public` por PostgREST con la service key (paginado) + los usuarios de Auth
 * (`auth.admin.listUsers`), comprimidos en JSON, con un manifiesto de filas y md5 por archivo. El esquema vive
 * en `supabase/migrations/` (no hace falta exportarlo). Rota: deja los últimos KEEP backups.
 *
 * Uso: pnpm db:backup  (destino: $TANDA_BACKUP_DIR, por defecto /mnt/hera/Backups/tanda-db/<fecha>)
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { createClient } from "@supabase/supabase-js";

const KEEP = 8;
const PAGE = 1000;

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).replace(/^"|"$/g, "")]),
);
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY ?? env.SUPABASE_SECRET_KEY;
if (!url || !key) throw new Error("Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY");

const root = process.env.TANDA_BACKUP_DIR ?? "/mnt/hera/Backups/tanda-db";
const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
const dir = join(root, `${stamp}-auto`);
mkdirSync(dir, { recursive: true });

const headers = { apikey: key, Authorization: `Bearer ${key}` };
const openapi = (await (await fetch(`${url}/rest/v1/`, { headers })).json()) as { definitions?: Record<string, unknown> };
const tables = Object.keys(openapi.definitions ?? {}).sort();
if (!tables.length) throw new Error("PostgREST no devolvió tablas");

const manifest: { file: string; rows: number; md5: string }[] = [];
function write(name: string, rows: unknown[]) {
  const buf = gzipSync(JSON.stringify(rows));
  const file = `${name}.json.gz`;
  writeFileSync(join(dir, file), buf);
  manifest.push({ file, rows: rows.length, md5: createHash("md5").update(buf).digest("hex") });
}

for (const t of tables) {
  const rows: unknown[] = [];
  for (let from = 0; ; from += PAGE) {
    const res = await fetch(`${url}/rest/v1/${t}?select=*`, {
      headers: { ...headers, Range: `${from}-${from + PAGE - 1}`, "Range-Unit": "items" },
    });
    if (!res.ok) throw new Error(`${t}: HTTP ${res.status} ${await res.text()}`);
    const page = (await res.json()) as unknown[];
    rows.push(...page);
    if (page.length < PAGE) break;
  }
  write(t, rows);
}

const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const users: unknown[] = [];
for (let page = 1; ; page++) {
  const { data, error } = await admin.auth.admin.listUsers({ page, perPage: PAGE });
  if (error) throw new Error(`auth.users: ${error.message}`);
  users.push(...data.users);
  if (data.users.length < PAGE) break;
}
write("auth_users", users);

writeFileSync(join(dir, "manifest.json"), JSON.stringify({ createdAt: new Date().toISOString(), url, manifest }, null, 2));
const total = manifest.reduce((s, m) => s + m.rows, 0);
console.log(`backup ${dir}: ${manifest.length} archivos, ${total} filas`);

// Rotación: solo los backups automáticos de este script, nunca los exports manuales.
const autos = readdirSync(root).filter((d) => d.endsWith("-auto")).sort();
for (const old of autos.slice(0, Math.max(0, autos.length - KEEP))) {
  rmSync(join(root, old), { recursive: true });
  console.log(`rotado ${old}`);
}
