/**
 * Fase G (feedback 4): 6 invitados juegan ranked REALES contra el Supabase del `.env.local` (prod) por las
 * mismas RPC que el cliente — `ranked_enqueue`/`ranked_poll` → `get_active_match` → `select_option` en cada
 * penal, con los pokes de `resolve_penalty`/`open_next_round` — hasta repartirse en ≥4 divisiones.
 *
 * Perfiles: "Ganadora" responde siempre bien y rápido, "Perdedora" siempre mal, y cuatro aciertan con
 * 0,7 / 0,55 / 0,45 / 0,3. La correcta sale del catálogo del repo (`data/questions/*.json`, oráculo SOLO del
 * script: no viaja a ningún cliente ni se lee de la DB).
 *
 * Verifica durante la corrida: emparejamiento dentro de la ventana (`queueWindow` según la espera), nunca
 * contra sí misma; Elo/delta/escudo/división según `lib/engine/ranked.ts`; y `get_ranking` ordenado.
 * Reporte en `artifacts/qa/ranked-sim.md`. Las sesiones quedan en `artifacts/qa/ranked-sim.sessions.json`
 * (gitignored) para reusar las MISMAS 6 cuentas en otra corrida. Las cuentas se marcan `qa_keep` aparte
 * (SQL con permisos de admin), así la poda de invitados no las borra.
 *
 *   pnpm qa:ranked-sim [--minutes 90] [--target-divisions 4]
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { applyResult, divisionFor, queueWindow, type RankedState } from "../../lib/engine/ranked";
import { type ActiveMatch, latencyTable, loadEnv, numArg, outDir, type Penal, pickOption, rand, rpc, sleep } from "./_shared.mjs";

const sessionsFile = join(outDir, "ranked-sim.sessions.json");
const reportFile = join(outDir, "ranked-sim.md");
const MAX_MINUTES = numArg("minutes", 90);
const TARGET_DIVISIONS = numArg("target-divisions", 4);

type Poll =
  | { status: "idle" }
  | { status: "matched"; tournament_id: string }
  | { status: "busy"; tournament_id: string }
  | { status: "queued"; waited_ms: number; rating: number };
type Me = { rating: number; shield: number; games: number; wins: number; position: number | null };
type MatchView = {
  status: string;
  settled: boolean;
  won: boolean | null;
  my_score: number;
  opp_score: number;
  me: { username: string; rating: number; result: { delta: number; rating: number; promoted: boolean; demoted: boolean; shield_saved: boolean; shield: number } | null };
  opp: { username: string; rating: number };
};
type RankingRow = { position: number; username: string; rating: number; division: string; games: number; wins: number };

// ───────────── jugadoras ─────────────
type Profile = { label: string; accuracy: number; reactMs: [number, number] };
const PROFILES: Profile[] = [
  { label: "Ganadora", accuracy: 1, reactMs: [700, 1200] },
  { label: "Perdedora", accuracy: 0, reactMs: [2500, 6000] },
  { label: "Crack", accuracy: 0.7, reactMs: [1500, 4000] },
  { label: "Buena", accuracy: 0.55, reactMs: [2000, 5000] },
  { label: "Regular", accuracy: 0.45, reactMs: [2000, 6000] },
  { label: "Floja", accuracy: 0.3, reactMs: [2500, 7000] },
];

interface Player {
  profile: Profile;
  sb: SupabaseClient;
  userId: string;
  username: string;
  games: number;
  wins: number;
  history: string[];
}

const failures: string[] = [];
const notes: string[] = [];
const matchLog: string[] = [];
function check(ok: boolean, msg: string) {
  if (!ok) {
    failures.push(msg);
    console.error(`✗ ${msg}`);
  }
}

async function signIn(url: string, key: string, saved: Record<string, string>, i: number): Promise<Player> {
  const profile = PROFILES[i]!;
  const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: true } });
  const refresh = saved[profile.label];
  if (refresh) {
    const { data, error } = await sb.auth.refreshSession({ refresh_token: refresh });
    if (!error && data.user) {
      const { data: p } = await sb.from("profiles").select("username").eq("id", data.user.id).single();
      return { profile, sb, userId: data.user.id, username: p?.username ?? "?", games: 0, wins: 0, history: [] };
    }
    console.warn(`(${profile.label}) la sesión guardada no sirve: ${error?.message}; creo una cuenta nueva`);
  }
  const username = `qa_${profile.label.toLowerCase().slice(0, 9)}_${Math.floor(Math.random() * 1000)}`.slice(0, 20);
  const { data, error } = await sb.auth.signInAnonymously({ options: { data: { username } } });
  if (error || !data.user) throw new Error(`signInAnonymously ${profile.label}: ${error?.message}`);
  return { profile, sb, userId: data.user.id, username, games: 0, wins: 0, history: [] };
}

/** Juega los penales del partido activo hasta que se asiente el resultado ranked. */
async function playMatch(p: Player, tournamentId: string): Promise<MatchView> {
  const answered = new Set<string>();
  let lastPoke = 0;
  for (;;) {
    const am = await rpc<ActiveMatch>(p.sb, "get_active_match").catch(() => undefined);
    if (am && am.tournament_id === tournamentId) {
      const pen = am.penal;
      if (!pen) {
        if (Date.now() - lastPoke > 1000) {
          lastPoke = Date.now();
          await p.sb.rpc("open_next_round", { p_tournament: tournamentId });
        }
      } else {
        const phaseKey = `${pen.penalty_id}:${pen.started_at}`;
        const offset = new Date(pen.server_now).getTime() - Date.now();
        const remaining = new Date(pen.deadline).getTime() - (Date.now() + offset);
        if (!answered.has(phaseKey) && pen.my_option == null && remaining > 300) {
          answered.add(phaseKey);
          const react = Math.min(rand(...p.profile.reactMs), remaining - 300);
          void answerLater(p, pen, react);
        }
        if (remaining <= 0 && Date.now() - lastPoke > 1000) {
          lastPoke = Date.now();
          await p.sb.rpc("resolve_penalty", { p_penalty: pen.penalty_id });
        }
      }
    } else {
      const view = await rpc<MatchView>(p.sb, "get_ranked_match", { p_tournament: tournamentId }).catch(() => null);
      if (view?.settled) return view;
      if (Date.now() - lastPoke > 1000) {
        lastPoke = Date.now();
        await p.sb.rpc("open_next_round", { p_tournament: tournamentId });
      }
    }
    await sleep(400);
  }
}

async function answerLater(p: Player, pen: Penal, delayMs: number) {
  await sleep(Math.max(0, delayMs));
  const pick = pickOption(pen, p.profile.accuracy);
  if (pick.unknown) notes.push(`pregunta fuera del catálogo: "${pen.prompt}"`);
  const { error } = await p.sb.rpc("select_option", { p_penalty: pen.penalty_id, p_option: pick.index });
  if (error && !/already_answered|out_of_window/.test(error.message)) notes.push(`${p.profile.label} select_option: ${error.message}`);
}

/** Un ciclo: cola → partido → asserts de Elo. */
async function oneGame(p: Player): Promise<void> {
  const before = await rpc<Me>(p.sb, "get_ranked_me");
  let poll = await rpc<Poll>(p.sb, "ranked_enqueue");
  let waitedMs = 0;
  const t0 = Date.now();
  while (poll.status === "queued") {
    waitedMs = poll.waited_ms;
    if (Date.now() - t0 > 120_000) {
      await p.sb.rpc("ranked_cancel");
      notes.push(`${p.profile.label}: 2 min en cola sin rival (se reintenta)`);
      return;
    }
    await sleep(1000);
    poll = await rpc<Poll>(p.sb, "ranked_poll");
  }
  if (poll.status === "idle") return;
  const tournamentId = poll.tournament_id;
  const view = await playMatch(p, tournamentId);

  // ── asserts ──
  check(view.opp.username !== view.me.username, `${p.profile.label} jugó contra sí misma`);
  check(view.me.rating === before.rating, `${p.profile.label}: rating de entrada ${view.me.rating} ≠ el de get_ranked_me ${before.rating}`);
  const w = queueWindow(waitedMs / 1000 + 3); // +3 s: la espera la vemos desde el último poll
  const diff = Math.abs(view.me.rating - view.opp.rating);
  if (w != null && diff > w) {
    // La ventana es la mayor de las dos: si el rival esperó más, pudo abrirla él.
    notes.push(`${p.profile.label}: diferencia ${diff} > ventana propia ${w} (esperó ${Math.round(waitedMs / 1000)} s; la abrió el rival)`);
  }
  const res = view.me.result;
  check(res != null, `${p.profile.label}: partido asentado sin resultado`);
  if (res && view.won != null) {
    const st: RankedState = { rating: before.rating, shield: before.shield };
    const exp = applyResult(st, view.opp.rating, view.won);
    check(res.delta === exp.delta, `${p.profile.label}: delta ${res.delta} ≠ motor ${exp.delta} (${before.rating} vs ${view.opp.rating}, ${view.won ? "G" : "P"})`);
    check(res.rating === exp.state.rating, `${p.profile.label}: rating ${res.rating} ≠ motor ${exp.state.rating}`);
    check(res.shield === exp.state.shield, `${p.profile.label}: escudo ${res.shield} ≠ motor ${exp.state.shield}`);
    check(res.promoted === exp.promoted && res.demoted === exp.demoted && res.shield_saved === exp.shieldSaved, `${p.profile.label}: flags de división distintos al motor`);
    const after = await rpc<Me>(p.sb, "get_ranked_me");
    check(after.rating === res.rating, `${p.profile.label}: get_ranked_me ${after.rating} ≠ resultado ${res.rating}`);
    p.games++;
    if (view.won) p.wins++;
    const line = `${p.profile.label} (${before.rating}→${res.rating} ${divisionFor(res.rating).name}) ${view.won ? "le ganó" : "perdió con"} ${view.opp.username} (${view.opp.rating}) ${view.my_score}-${view.opp_score}, esperó ${Math.round(waitedMs / 1000)} s`;
    matchLog.push(line);
    p.history.push(divisionFor(res.rating).name);
    console.log(line);
  }
}

async function checkRanking(p: Player): Promise<RankingRow[]> {
  const r = await rpc<{ rows: RankingRow[] }>(p.sb, "get_ranking", { p_limit: 100 });
  const rows = r.rows ?? [];
  for (let i = 1; i < rows.length; i++) {
    check(rows[i - 1]!.rating >= rows[i]!.rating, `get_ranking fuera de orden en ${i}`);
    check(rows[i]!.position >= rows[i - 1]!.position, `get_ranking posiciones no crecientes en ${i}`);
  }
  for (const row of rows) check(row.division === divisionFor(row.rating).id, `get_ranking: ${row.username} ${row.rating} en ${row.division}`);
  return rows;
}

async function main() {
  const { url, key } = loadEnv();
  console.log(`ranked-sim contra ${new URL(url).host} · ${MAX_MINUTES} min máx · objetivo ${TARGET_DIVISIONS} divisiones`);
  mkdirSync(outDir, { recursive: true });
  const saved: Record<string, string> = existsSync(sessionsFile) ? JSON.parse(readFileSync(sessionsFile, "utf8")) : {};
  const players: Player[] = [];
  for (let i = 0; i < PROFILES.length; i++) players.push(await signIn(url, key, saved, i));
  const persist = async () => {
    const out: Record<string, string> = {};
    for (const p of players) {
      const { data } = await p.sb.auth.getSession();
      if (data.session) out[p.profile.label] = data.session.refresh_token;
    }
    writeFileSync(sessionsFile, JSON.stringify(out, null, 2));
  };
  await persist();
  console.log(players.map((p) => `${p.profile.label}=${p.username}`).join(" · "));
  console.log(`ids (para qa_keep): ${players.map((p) => p.userId).join(",")}`);

  const deadline = Date.now() + MAX_MINUTES * 60_000;
  const divisionsNow = async () => {
    const ds = await Promise.all(players.map(async (p) => divisionFor((await rpc<Me>(p.sb, "get_ranked_me")).rating).id));
    return new Set(ds);
  };
  let done = false;
  const loops = players.map(async (p, i) => {
    await sleep(i * 700); // escalonado: que no entren todos en el mismo instante
    while (!done && Date.now() < deadline) {
      // Espera al azar antes de volver a la cola: si no, las parejas terminan juntas y se re-emparejan siempre
      // igual (`last_opponent` es solo una preferencia: si no hay otro en la cola, toca el mismo).
      await sleep(rand(0, 9000));
      try {
        await oneGame(p);
      } catch (e) {
        notes.push(`${p.profile.label}: ${(e as Error).message}`);
        await sleep(3000);
      }
      if (p.games >= 3 && (await divisionsNow()).size >= TARGET_DIVISIONS && players.every((x) => x.games >= 3)) done = true;
      await persist();
    }
  });
  await Promise.all(loops);

  const rows = await checkRanking(players[0]!);
  const mine = new Set(players.map((p) => p.username));
  const final = await Promise.all(players.map(async (p) => ({ p, me: await rpc<Me>(p.sb, "get_ranked_me") })));
  const divs = new Set(final.map((f) => divisionFor(f.me.rating).id));
  check(divs.size >= TARGET_DIVISIONS, `solo ${divs.size} divisiones distintas (objetivo ${TARGET_DIVISIONS})`);

  const report = [
    `# Ranked sim — ${new Date().toISOString()}`,
    "",
    `Contra \`${new URL(url).host}\`. ${matchLog.length} partidos jugados por las 6 cuentas.`,
    "",
    "| Perfil | Usuario | Puntos | División | Escudo | PJ | PG | Puesto |",
    "|---|---|---|---|---|---|---|---|",
    ...final.map(({ p, me }) => `| ${p.profile.label} | ${p.username} | ${me.rating} | ${divisionFor(me.rating).name} | ${me.shield} | ${me.games} | ${me.wins} | ${me.position ?? "—"} |`),
    "",
    `Divisiones distintas: **${divs.size}** (${[...divs].join(", ")}).`,
    `En \`get_ranking\`: ${rows.filter((r) => mine.has(r.username)).length}/6 cuentas, ${rows.length} filas.`,
    "",
    `## Fallas (${failures.length})`,
    ...(failures.length ? failures.map((f) => `- ${f}`) : ["- ninguna"]),
    "",
    `## Notas (${notes.length})`,
    ...[...new Set(notes)].slice(0, 60).map((n) => `- ${n}`),
    "",
    "## Latencia de RPC",
    ...latencyTable(),
    "",
    "## Partidos",
    ...matchLog.map((l) => `- ${l}`),
  ].join("\n");
  writeFileSync(reportFile, report);
  console.log(`\nReporte: ${reportFile}\nFallas: ${failures.length}`);
  process.exit(failures.length ? 1 : 0);
}

void main();
