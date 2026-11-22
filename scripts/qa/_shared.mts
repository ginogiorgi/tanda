/**
 * Piezas comunes de las simulaciones de QA contra un Supabase real (`ranked-sim`, `load-sim`): env pública,
 * oráculo de respuestas (SOLO del script, sale del catálogo del repo: no viaja a ningún cliente ni se lee de
 * la DB), `rpc` con reintentos y métricas de latencia, y la elección de la opción según la precisión.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";

export const root = join(import.meta.dirname, "..", "..");
export const outDir = join(root, "artifacts", "qa");

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
export const rand = (a: number, b: number) => a + Math.random() * (b - a);

export function numArg(name: string, def: number): number {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? Number(process.argv[i + 1]) : def;
}

/** Solo las claves públicas: las simulaciones juegan como un cliente más. */
export function loadEnv(): { url: string; key: string } {
  const env: Record<string, string> = {};
  for (const f of [".env.local", ".env"]) {
    const p = join(root, f);
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, "utf8").split("\n")) {
      const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
      if (m && !(m[1]! in env)) env[m[1]!] = m[2]!.replace(/^["']|["']$/g, "");
    }
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Faltan NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  return { url, key };
}

type CatalogQ = { prompt: string; options: [string, string, string]; answer: number };
const oracle = new Map<string, string>();
for (const f of ["worldcup.json", "arg.json"]) {
  for (const q of JSON.parse(readFileSync(join(root, "data", "questions", f), "utf8")) as CatalogQ[]) {
    oracle.set(q.prompt.trim(), q.options[q.answer]!.trim());
  }
}

export type Penal = {
  penalty_id: string;
  idx: number;
  prompt: string;
  options: string[];
  started_at: string;
  deadline: string;
  server_now: string;
  removed_option?: number;
  my_option?: number | null;
};
export type ActiveMatch = { tournament_id: string; match_id: string; phase: string; penal: Penal | null } | null;

/** Latencias por RPC (ms), para p50/p95 en los reportes. */
export const latency = new Map<string, number[]>();

export async function rpc<T>(sb: SupabaseClient, fn: string, args?: Record<string, unknown>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const t0 = performance.now();
    const { data, error } = await sb.rpc(fn, args);
    latency.set(fn, [...(latency.get(fn) ?? []), performance.now() - t0]);
    if (!error) return data as T;
    if (attempt >= 3 || /already_answered|out_of_window|not_open|rate_limited/.test(error.message)) {
      throw new Error(`${fn}: ${error.message}`);
    }
    await sleep(500 * (attempt + 1));
  }
}

export function percentile(xs: number[], p: number): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))]!;
}

export function latencyTable(): string[] {
  return [
    "| RPC | llamadas | p50 ms | p95 ms | máx ms |",
    "|---|---|---|---|---|",
    ...[...latency.entries()]
      .sort((a, b) => b[1].length - a[1].length)
      .map(([fn, xs]) => `| ${fn} | ${xs.length} | ${Math.round(percentile(xs, 50))} | ${Math.round(percentile(xs, 95))} | ${Math.round(Math.max(...xs))} |`),
  ];
}

/**
 * Opción a elegir: la correcta con probabilidad `accuracy` (si el oráculo la conoce), si no una incorrecta.
 * `unknown` avisa que la pregunta no está en el catálogo del repo.
 */
export function pickOption(pen: Penal, accuracy: number): { index: number; unknown: boolean } {
  const visible = pen.options.map((text, i) => ({ text: text.trim(), i })).filter((o) => o.i !== pen.removed_option);
  const correct = oracle.get(pen.prompt.trim());
  const right = visible.find((o) => o.text === correct);
  const wrong = visible.filter((o) => o.text !== correct);
  const pick = (Math.random() < accuracy && right) || wrong[Math.floor(Math.random() * wrong.length)] || visible[0]!;
  return { index: pick.i, unknown: correct == null };
}

/**
 * Poke sin esperar la respuesta (como `fire()` del cliente). OJO: `void sb.rpc(...)` NO manda nada (el builder
 * es perezoso, se ejecuta recién con `.then`); por eso este helper y no `void`.
 */
export function poke(sb: SupabaseClient, fn: string, args?: Record<string, unknown>): void {
  const t0 = performance.now();
  sb.rpc(fn, args).then(
    () => latency.set(fn, [...(latency.get(fn) ?? []), performance.now() - t0]),
    () => undefined,
  );
}
