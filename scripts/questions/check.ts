/**
 * Validador editorial del banco de preguntas (Fase 5). Complementa `catalog:check` (schema):
 *
 *   pnpm questions:check            → reporte por modo; exit 1 si hay casi-duplicados
 *   pnpm questions:check --report   → igual, pero nunca falla (para revisar un banco en curso)
 *   pnpm questions:topics           → recalcula y escribe el `topic` de cada pregunta
 *
 * Detecta:
 *  · Casi-duplicados: Jaccard de tokens normalizados del enunciado ≥ 0.6 (con los mismos números o la
 *    misma respuesta: "Balón de Oro 2006" vs "2010" es otra pregunta), o misma respuesta correcta con
 *    enunciados parecidos (≥ 0.4). Son las preguntas que un jugador siente "repetidas".
 *  · Filtraciones: dos preguntas sobre el mismo hecho donde el enunciado de una nombra la respuesta
 *    de la otra ("¿Qué club ganó X?" + "¿Qué DT ganó X con Estudiantes?").
 *    Con poco texto en común también cuenta si comparten año y ≥10% del contexto (`sameEvent`).
 *  · Posibles filtraciones lejanas (informativo): una nombra la respuesta de la otra y comparten año
 *    pero casi nada más ("Argentina jugó en 2022" vs "¿quién ganó 2022?"): pistas débiles, no entran a
 *    los temas; se listan con `--leaks` para revisarlas a mano.
 *  · Balance de categorías (alerta si una supera el 25% del banco).
 *  · Posición de la correcta (alerta si alguna posición se aleja >5 pp del tercio).
 *  · Pirámide de dificultad (easy ≥ medium ≥ hard ≥ very_hard).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { DIFFICULTIES, MODES, questionSchema } from "../../lib/catalog/schema";

type Question = z.infer<typeof questionSchema>;

const root = join(import.meta.dirname, "..", "..");
const reportOnly = process.argv.includes("--report");
const writeTopics = process.argv.includes("--write-topics");
const listLeaks = process.argv.includes("--leaks");
const pairsOut = process.argv.includes("--pairs") ? process.argv[process.argv.indexOf("--pairs") + 1] : undefined;
const allPairs: { a: string; b: string; why: string }[] = [];

const STOP = new Set(
  (
    "el la los las un una unos unas de del al a en y o que qué cual cuál cuales cuáles quien quién " +
    "como cómo cuanto cuánto cuantos cuántos cuantas cuántas por para con se su sus es fue fueron " +
    "ser lo le les mundial copa selección seleccion equipo club partido historia año"
  ).split(" "),
);

export function tokens(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9 ]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length > 1 && !STOP.has(t)),
  );
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  return inter / (a.size + b.size - inter);
}

const norm = (s: string) => s.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

interface Pair {
  a: Question;
  b: Question;
  score: number;
  why: "enunciado" | "misma respuesta" | "filtra la respuesta";
}

/** ¿El enunciado `prompt` nombra la respuesta correcta `answer`? (palabra completa, sin tildes). */
function names(prompt: string, answer: string): boolean {
  const a = norm(answer);
  if (a.length < 4 || /^\d+$/.test(a)) return false;
  return new RegExp(`(^|[^a-z0-9])${a.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z0-9]|$)`).test(norm(prompt));
}

/** Números del enunciado (años, cantidades): si difieren, es otro dato aunque la plantilla sea igual. */
function numbers(t: Set<string>): string {
  return [...t].filter((x) => /^\d+$/.test(x)).sort().join(",");
}

const YEAR = /^(19[3-9]\d|20\d\d)$/;

/** Ganar/perder un título es el mismo hecho → un solo token. */
const TITLE = new Set(
  "campeon campeona campeones gano gana ganar ganaron ganador consagro final finales titulo subcampeon subcampeona perdio vencio levanto".split(
    " ",
  ),
);

const HOST_Q = /organiz|sede|se jugo|se juega|en que pais/;

/** "¿Qué selección ganó el Mundial 1962 en Chile?" regala "¿Qué país organizó el Mundial 1962?". */
function hostLeak(a: Question, b: Question): boolean {
  if (!HOST_Q.test(norm(b.prompt))) return false;
  const host = norm(b.options[b.answer]!);
  return new RegExp(`(^|[^a-z0-9])en ${host.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z0-9]|$)`).test(norm(a.prompt));
}

/**
 * ¿Hablan del mismo hecho aunque se parezcan poco? Comparten un año y ≥ 10% del resto del texto
 * (sin años ni las palabras de las respuestas, que justamente son lo que se filtra).
 */
function sameEvent(a: Question, b: Question, ta: Set<string>, tb: Set<string>): boolean {
  const ya = [...ta].filter((t) => YEAR.test(t));
  if (!ya.some((y) => tb.has(y))) return false;
  if (hostLeak(a, b) || hostLeak(b, a)) return true;
  const skip = new Set([...tokens(a.options[a.answer]!), ...tokens(b.options[b.answer]!)]);
  // Ganar/perder un título es el mismo hecho ("perdió la final ante Francia" ↔ "¿quién fue campeón?").
  const rest = (t: Set<string>) =>
    new Set([...t].filter((x) => !YEAR.test(x) && !skip.has(x)).map((x) => (TITLE.has(x) ? "·titulo" : x)));
  return jaccard(rest(ta), rest(tb)) >= 0.1;
}

function nearDuplicates(qs: Question[]): Pair[] {
  const tk = qs.map((q) => tokens(q.prompt));
  const nums = tk.map(numbers);
  const ans = qs.map((q) => norm(q.options[q.answer]!));
  const out: Pair[] = [];
  for (let i = 0; i < qs.length; i++) {
    for (let j = i + 1; j < qs.length; j++) {
      const s = jaccard(tk[i]!, tk[j]!);
      const sameFacts = nums[i] === nums[j] || ans[i] === ans[j];
      if (s >= 0.6 && sameFacts) out.push({ a: qs[i]!, b: qs[j]!, score: s, why: "enunciado" });
      else if (s >= 0.4 && ans[i] === ans[j]) out.push({ a: qs[i]!, b: qs[j]!, score: s, why: "misma respuesta" });
      // Filtración: dos preguntas sobre el mismo hecho donde una nombra la respuesta de la otra
      // (si salen en el mismo partido, una regala la otra).
      // Con poco texto en común (< 0.3) cuenta igual si comparten año y algo de contexto aparte de la
      // respuesta ("¿Qué DT llevó a Estudiantes a ganar la Copa de la Liga 2024?" regala "¿Qué club
      // ganó la Copa de la Liga 2024?").
      // Orden medido: `sameEvent` corta enseguida sin año compartido; `names` arma una RegExp por
      // llamada → ponerlo primero triplica el tiempo (0,54 s → 1,45 s).
      else if (
        (s >= 0.3 || sameEvent(qs[i]!, qs[j]!, tk[i]!, tk[j]!)) &&
        (names(qs[j]!.prompt, qs[i]!.options[qs[i]!.answer]!) || names(qs[i]!.prompt, qs[j]!.options[qs[j]!.answer]!))
      )
        out.push({ a: qs[i]!, b: qs[j]!, score: s, why: "filtra la respuesta" });
    }
  }
  return out.sort((x, y) => y.score - x.score);
}

/** Filtraciones lejanas: mismo año y una nombra la respuesta de la otra, en temas distintos. */
function farLeaks(qs: Question[], topicOf: Map<string, string>): [Question, Question][] {
  const years = qs.map((q) => [...tokens(q.prompt)].filter((t) => YEAR.test(t)));
  const out: [Question, Question][] = [];
  for (let i = 0; i < qs.length; i++) {
    for (let j = 0; j < qs.length; j++) {
      if (i === j || !years[i]!.some((y) => years[j]!.includes(y))) continue;
      const ti = topicOf.get(qs[i]!.key);
      if (ti && ti === topicOf.get(qs[j]!.key)) continue;
      if (names(qs[i]!.prompt, qs[j]!.options[qs[j]!.answer]!)) out.push([qs[i]!, qs[j]!]);
    }
  }
  return out;
}

const pct = (n: number, d: number) => `${((100 * n) / d).toFixed(1)}%`;

// Pares ya revisados a mano (misma plantilla, distinto dato): no se vuelven a reportar.
const reviewed = new Set(
  (JSON.parse(readFileSync(join(root, "data/questions/reviewed-pairs.json"), "utf8")) as { pairs: [string, string][] }).pairs.map(
    ([a, b]) => `${a}|${b}`,
  ),
);

let failed = false;
for (const mode of MODES) {
  const rawText = readFileSync(join(root, `data/questions/${mode}.json`), "utf8");
  const raw: unknown = JSON.parse(rawText);
  const qs = z.array(questionSchema).parse(raw);
  console.log(`\n━━ ${mode}: ${qs.length} preguntas`);

  const cats = new Map<string, number>();
  for (const q of qs) cats.set(q.category, (cats.get(q.category) ?? 0) + 1);
  const catLine = [...cats.entries()].sort((a, b) => b[1] - a[1]);
  console.log("categorías:", catLine.map(([c, n]) => `${c} ${pct(n, qs.length)}`).join(" · "));
  for (const [c, n] of catLine) if (n / qs.length > 0.25) console.log(`  ⚠ ${c} supera el 25% (${pct(n, qs.length)})`);

  const pos = [0, 0, 0];
  for (const q of qs) pos[q.answer]!++;
  console.log("posición correcta:", pos.map((n, i) => `${"ABC"[i]} ${pct(n, qs.length)}`).join(" · "));
  for (const n of pos) if (Math.abs(n / qs.length - 1 / 3) > 0.05) console.log("  ⚠ posición desbalanceada");

  const diff = DIFFICULTIES.map((d) => qs.filter((q) => q.difficulty === d).length);
  console.log("dificultad:", DIFFICULTIES.map((d, i) => `${d} ${diff[i]}`).join(" · "));
  if (diff.some((n, i) => i > 0 && n > diff[i - 1]!)) console.log("  ⚠ la pirámide de dificultad no baja");

  const raw2 = nearDuplicates(qs);
  for (const d of raw2) allPairs.push({ a: d.a.key, b: d.b.key, why: d.why });

  // Temas: componentes conexos de los pares (mismo hecho, filtraciones y familias de plantilla). El
  // server prefiere no repetir tema dentro de un torneo → ni "repetidas" ni una que regale la otra.
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    let r = x;
    while (parent.get(r) !== undefined && parent.get(r) !== r) r = parent.get(r)!;
    parent.set(x, r);
    return r;
  };
  for (const d of raw2) {
    const ra = find(d.a.key);
    const rb = find(d.b.key);
    if (ra !== rb) parent.set(ra < rb ? rb : ra, ra < rb ? ra : rb);
    else parent.set(ra, ra);
  }
  const members = new Map<string, string[]>();
  for (const k of parent.keys()) {
    const r = find(k);
    members.set(r, [...(members.get(r) ?? []), k]);
  }
  const topicOf = new Map<string, string>();
  for (const ks of members.values()) {
    const id = [...ks].sort()[0]!;
    for (const k of ks) topicOf.set(k, id);
  }
  const stale = qs.filter((q) => q.topic !== topicOf.get(q.key)).length;
  console.log(`temas: ${members.size} grupos (${topicOf.size} preguntas)${stale ? ` · ⚠ ${stale} desactualizadas → pnpm questions:topics` : ""}`);
  if (stale) failed = true;
  if (writeTopics && stale) {
    const out = qs.map((q) => {
      const { topic: _old, ...rest } = q;
      const t = topicOf.get(q.key);
      return t ? { ...rest, topic: t } : rest;
    });
    // Respetar la indentación del archivo (diffs chicos).
    // Primer nivel del array (`[\n  {`), no el de las claves de cada pregunta.
    const indent = /^\[\n( +)/.exec(rawText)?.[1]?.length ?? 2;
    writeFileSync(join(root, `data/questions/${mode}.json`), `${JSON.stringify(out, null, indent)}\n`);
    console.log(`  ✓ temas escritos en data/questions/${mode}.json`);
  }
  const leaks = farLeaks(qs, topicOf);
  console.log(`posibles filtraciones (mismo año, otro tema): ${leaks.length}${listLeaks ? "" : " · ver con --leaks"}`);
  if (listLeaks) {
    for (const [a, b] of leaks) console.log(`  ${a.key} nombra la respuesta de ${b.key} (${b.options[b.answer]})\n    · ${a.prompt}\n    · ${b.prompt}`);
  }

  const dups = raw2.filter((d) => d.why !== "filtra la respuesta").filter(
    (d) => !reviewed.has(`${d.a.key}|${d.b.key}`) && !reviewed.has(`${d.b.key}|${d.a.key}`),
  );
  console.log(`casi-duplicados: ${dups.length}`);
  for (const d of dups.slice(0, 400)) {
    console.log(`  ${d.a.key} ~ ${d.b.key} (${d.why} ${d.score.toFixed(2)})\n    · ${d.a.prompt}\n    · ${d.b.prompt}`);
  }
  if (dups.length > 60) console.log(`  … y ${dups.length - 60} más`);
  if (dups.length > 0) failed = true;
}

if (pairsOut) writeFileSync(pairsOut, JSON.stringify(allPairs));

if (failed && !reportOnly) {
  console.error("\n✗ hay casi-duplicados (revisar arriba)");
  process.exit(1);
}
console.log("\n✓ questions:check");
