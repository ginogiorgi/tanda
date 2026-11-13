/**
 * Genera la migración de seed del catálogo desde `data/` (fuente de verdad), por modo.
 *
 *   pnpm catalog:check                      → valida todo (CI)
 *   pnpm catalog:build <timestamp_nombre>   → escribe supabase/migrations/<timestamp_nombre>.sql
 *   pnpm catalog:build <timestamp_nombre> --mode arg [--activate]
 *                                           → solo ese modo (y opcionalmente lo activa en game_modes)
 *
 * Archivos por modo: data/teams/<mode>.json y data/questions/<mode>.json (opcional mientras se arma).
 * La migración es un *sync* idempotente (upsert por clave natural). No borra filas: retirar preguntas
 * se hace con una migración propia para no romper el historial que las referencia.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { MODES, questionSchema, teamSchema } from "../../lib/catalog/schema";

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

function assertUnique(values: string[], label: string): void {
  const seen = new Set<string>();
  for (const v of values) {
    if (seen.has(v)) {
      console.error(`✗ ${label} duplicado: ${v}`);
      process.exit(1);
    }
    seen.add(v);
  }
}

const lit = (s: string | null): string => (s === null ? "null" : `'${s.replaceAll("'", "''")}'`);

const ROOM_SIZE: Record<(typeof MODES)[number], number> = { worldcup: 48, arg: 30 };

const catalog = MODES.map((mode) => {
  const teams = load(`data/teams/${mode}.json`, teamSchema);
  const qPath = `data/questions/${mode}.json`;
  const questions = existsSync(join(root, qPath)) ? load(qPath, questionSchema) : [];
  assertUnique(teams.map((t) => t.code), `equipo (${mode})`);
  assertUnique(teams.map((t) => String(t.strength_rank)), `strength_rank (${mode})`);
  if (teams.length !== ROOM_SIZE[mode]) {
    console.error(`✗ ${mode}: ${teams.length} equipos, el formato pide ${ROOM_SIZE[mode]}`);
    process.exit(1);
  }
  const prefix = mode === "worldcup" ? "wc-" : `${mode}-`;
  const bad = questions.find((q) => !q.key.startsWith(prefix));
  if (bad) {
    console.error(`✗ ${qPath}: ${bad.key} no empieza con ${prefix}`);
    process.exit(1);
  }
  return { mode, teams, questions };
});
assertUnique(catalog.flatMap((c) => c.questions.map((q) => q.key)), "pregunta");

const [, , target, ...flags] = process.argv;
const onlyMode = flags.includes("--mode") ? flags[flags.indexOf("--mode") + 1] : undefined;
const activate = flags.includes("--activate");
if (onlyMode && !MODES.some((m) => m === onlyMode)) {
  console.error(`✗ modo desconocido: ${onlyMode}`);
  process.exit(1);
}
if (!target) {
  for (const c of catalog) console.log(`✓ ${c.mode}: ${c.teams.length} equipos, ${c.questions.length} preguntas`);
  process.exit(0);
}

const selected = onlyMode ? catalog.filter((c) => c.mode === onlyMode) : catalog;
const blocks = selected.map(({ mode, teams, questions }) => {
  const teamRows = teams
    .map(
      (t) =>
        `  (${lit(mode)}, ${lit(t.code)}, ${lit(t.name)}, ${lit(t.short_name)}, ${t.strength_rank}, ${lit(t.difficulty_tier)}, ${lit(t.accent_color)}, ${lit(t.flag_asset)}, ${lit(t.crest_asset)}, ${lit(t.kit_pattern)}, ${lit(t.kit_primary)}, ${lit(t.kit_secondary)}, ${lit(t.kit_tertiary)})`,
    )
    .join(",\n");
  const teamSql = `insert into public.teams (mode_id, code, name, short_name, strength_rank, difficulty_tier, accent_color, flag_asset, crest_asset, kit_pattern, kit_primary, kit_secondary, kit_tertiary)
values
${teamRows}
on conflict (mode_id, code) do update set
  name = excluded.name, short_name = excluded.short_name, strength_rank = excluded.strength_rank,
  difficulty_tier = excluded.difficulty_tier, accent_color = excluded.accent_color,
  flag_asset = excluded.flag_asset, crest_asset = excluded.crest_asset, kit_pattern = excluded.kit_pattern,
  kit_primary = excluded.kit_primary, kit_secondary = excluded.kit_secondary, kit_tertiary = excluded.kit_tertiary;`;

  if (questions.length === 0) return `-- ── ${mode} ──\n${teamSql}\n`;

  const qRows = questions
    .map(
      (q) =>
        `  (${lit(mode)}, ${lit(q.key)}, ${lit(q.category)}, ${lit(q.difficulty)}, ${lit(q.prompt)}, ${lit(JSON.stringify(q.options))}::jsonb, ${q.answer})`,
    )
    .join(",\n");
  return `-- ── ${mode} ──
${teamSql}

insert into public.questions (mode_id, source_key, category, difficulty, prompt, options, correct_index)
values
${qRows}
on conflict (source_key) do update set
  mode_id = excluded.mode_id, category = excluded.category, difficulty = excluded.difficulty,
  prompt = excluded.prompt, options = excluded.options, correct_index = excluded.correct_index;
`;
});

const summary = selected.map((c) => `${c.mode}: ${c.teams.length} equipos · ${c.questions.length} preguntas`).join(" | ");
const sql = `-- GENERADO por scripts/catalog/build-seed.ts desde data/. NO editar a mano.
-- ${summary}

${blocks.join("\n")}${
  activate && onlyMode ? `\nupdate public.game_modes set active = true where id = ${lit(onlyMode)};\n` : ""
}`;

const out = join(root, "supabase", "migrations", `${target}.sql`);
writeFileSync(out, sql);
console.log(`✓ ${out}`);
