/**
 * Genera la migración de seed del catálogo desde `data/` (fuente de verdad).
 *
 *   pnpm catalog:build <timestamp_nombre>   → escribe supabase/migrations/<timestamp_nombre>.sql
 *   pnpm catalog:check                      → solo valida (CI)
 *
 * La migración es un *sync* idempotente: upsert por clave natural (source_key / code). No borra
 * filas: retirar preguntas se hace con un flag explícito en una migración propia, para no romper
 * el historial que las referencia.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { nationSchema, questionSchema } from "../../lib/catalog/schema";

const root = join(import.meta.dirname, "..", "..");

function load<T>(rel: string, schema: z.ZodType<T>): T[] {
  const raw: unknown = JSON.parse(readFileSync(join(root, rel), "utf8"));
  const parsed = z.array(schema).safeParse(raw);
  if (!parsed.success) {
    console.error(`✗ ${rel}\n${z.prettifyError(parsed.error)}`);
    process.exit(1);
  }
  return parsed.data;
}

function uniqueBy<T>(rows: T[], key: (r: T) => string, label: string): void {
  const seen = new Set<string>();
  for (const r of rows) {
    const k = key(r);
    if (seen.has(k)) {
      console.error(`✗ ${label} duplicado: ${k}`);
      process.exit(1);
    }
    seen.add(k);
  }
}

const lit = (s: string | null): string => (s === null ? "null" : `'${s.replaceAll("'", "''")}'`);

const nations = load("data/teams/worldcup.json", nationSchema);
const questions = load("data/questions/worldcup.json", questionSchema);
uniqueBy(nations, (n) => n.code, "nación");
uniqueBy(questions, (q) => q.key, "pregunta");

const [, , target] = process.argv;
if (!target) {
  console.log(`✓ catálogo válido: ${nations.length} naciones, ${questions.length} preguntas`);
  process.exit(0);
}

const nationRows = nations
  .map(
    (n) =>
      `  (${lit(n.code)}, ${lit(n.name)}, ${n.fifa_rank}, ${lit(n.difficulty_tier)}, ${lit(n.accent_color)}, ${lit(n.flag_asset)}, ${lit(n.kit_primary)}, ${lit(n.kit_secondary)})`,
  )
  .join(",\n");

const questionRows = questions
  .map(
    (q) =>
      `  (${lit(q.key)}, ${lit(q.category)}, ${lit(q.difficulty)}, ${lit(q.prompt)}, ${lit(JSON.stringify(q.options))}::jsonb, ${q.answer})`,
  )
  .join(",\n");

const sql = `-- GENERADO por scripts/catalog/build-seed.ts desde data/. NO editar a mano.
-- ${nations.length} naciones · ${questions.length} preguntas

insert into public.nations (code, name, fifa_rank, difficulty_tier, accent_color, flag_asset, kit_primary, kit_secondary)
values
${nationRows}
on conflict (code) do update set
  name = excluded.name, fifa_rank = excluded.fifa_rank, difficulty_tier = excluded.difficulty_tier,
  accent_color = excluded.accent_color, flag_asset = excluded.flag_asset,
  kit_primary = excluded.kit_primary, kit_secondary = excluded.kit_secondary;

insert into public.questions (source_key, category, difficulty, prompt, options, correct_index)
values
${questionRows}
on conflict (source_key) do update set
  category = excluded.category, difficulty = excluded.difficulty, prompt = excluded.prompt,
  options = excluded.options, correct_index = excluded.correct_index;
`;

const out = join(root, "supabase", "migrations", `${target}.sql`);
writeFileSync(out, sql);
console.log(`✓ ${out}`);
