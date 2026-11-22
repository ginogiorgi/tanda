/**
 * Huella del esquema de la DB LOCAL (Plan 5 T). Para prod, correr `scripts/db/fingerprint.sql` por MCP
 * (`execute_sql`) y comparar sección por sección: un hash distinto = drift entre prod y las migraciones.
 * Uso: pnpm db:fingerprint [--json]
 */
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import pg from "pg";

const status = execSync("pnpm exec supabase status -o env", { encoding: "utf8" });
const dbUrl = /^DB_URL="(.*)"$/m.exec(status)?.[1];
if (!dbUrl) throw new Error("Supabase local no está corriendo (pnpm db:start)");

const client = new pg.Client({ connectionString: dbUrl });
await client.connect();
const { rows } = await client.query<{ section: string; n: number; hash: string }>(
  readFileSync("scripts/db/fingerprint.sql", "utf8"),
);
await client.end();
if (process.argv.includes("--json")) console.log(JSON.stringify(rows));
else for (const r of rows) console.log(`${r.section.padEnd(18)} ${String(r.n).padStart(4)}  ${r.hash}`);
