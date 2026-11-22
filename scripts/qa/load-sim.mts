/**
 * Prueba de carga (Plan 5 L): N invitados (`qa_load_*`, persistentes) entran por `quick_play` a UNA sala del
 * Mundial y juegan el torneo entero contra el Supabase del `.env.local` (prod), como el cliente real:
 * `begin_presentation`, poll de `get_active_match` cada 1 s, `select_option` con tiempos de reacción humanos,
 * poke de `resolve_penalty` al vencer el deadline, y Realtime (`match:*` → `penal:start`, `tournament:*` →
 * `round:next` con el poke preciso de `open_next_round`), más el watchdog del cliente.
 *
 * Mide con los timestamps del SERVER: hueco entre penales del mismo partido (esperado `TIMING.betweenPenalsS`),
 * latencia del broadcast `penal:start`, latencia de cada RPC (p50/p95) y trabas (≥45 s sin fase nueva con el
 * partido vivo). Falla si hay trabas o huecos > esperado + `--slack` s. Reporte en `artifacts/qa/load-sim.md`.
 * Las sesiones quedan en `artifacts/qa/load-sim.<proyecto>.sessions.json` (gitignored); marcar las cuentas `qa_keep`.
 *
 *   pnpm qa:load-sim [--players 24] [--minutes 40] [--slack 1.5]
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createClient, type RealtimeChannel, type SupabaseClient } from "@supabase/supabase-js";
import { TIMING } from "../../lib/engine/timing";
import { type ActiveMatch, latencyTable, loadEnv, numArg, outDir, type Penal, percentile, pickOption, poke, rand, rpc, sleep } from "./_shared.mjs";

const PLAYERS = numArg("players", 24);
const MAX_MINUTES = numArg("minutes", 40);
const SLACK_S = numArg("slack", 1.5);
const reportFile = join(outDir, "load-sim.md");
const STALL_MS = 45_000;
const DONE_AFTER_NULL_MS = 20_000;

interface Phase {
  matchId: string;
  penaltyId: string;
  idx: number;
  start: number;
  deadline: number;
}
interface Player {
  label: string;
  sb: SupabaseClient;
  userId: string;
  username: string;
  accuracy: number;
  tournamentId: string | null;
  phases: Map<string, Phase>;
  channels: Map<string, RealtimeChannel>;
  lastProgress: number;
  /** server - local (ms), del último `get_active_match`. */
  offset: number;
  done: boolean;
}

const failures: string[] = [];
const notes: string[] = [];
const broadcastLagMs: number[] = [];
/** `round:next` recibidos: [recibido (hora server), open_at]. Parte el hueco en "cierre del server" y "apertura". */
const roundNext: { at: number; openAt: number }[] = [];
const gaps: { kind: "penal" | "second_chance" | "match"; s: number; where: string }[] = [];
const ms = (iso: string) => new Date(iso).getTime();

async function signIn(url: string, key: string, saved: Record<string, string>, i: number): Promise<Player> {
  const label = `L${String(i + 1).padStart(2, "0")}`;
  const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: true } });
  const base = { label, sb, accuracy: rand(0.3, 0.9), tournamentId: null, phases: new Map(), channels: new Map(), lastProgress: Date.now(), offset: 0, done: false };
  const refresh = saved[label];
  if (refresh) {
    const { data, error } = await sb.auth.refreshSession({ refresh_token: refresh });
    if (!error && data.user) {
      const { data: p } = await sb.from("profiles").select("username").eq("id", data.user.id).single();
      await sb.realtime.setAuth(data.session?.access_token ?? null);
      return { ...base, userId: data.user.id, username: p?.username ?? "?" };
    }
  }
  const username = `qa_load_${String(i + 1).padStart(2, "0")}_${Math.floor(Math.random() * 1000)}`;
  const { data, error } = await sb.auth.signInAnonymously({ options: { data: { username } } });
  if (error || !data.user) throw new Error(`signInAnonymously ${label}: ${error?.message}`);
  await sb.realtime.setAuth(data.session?.access_token ?? null);
  return { ...base, userId: data.user.id, username };
}

function subscribe(p: Player, topic: string, events: Record<string, (payload: Record<string, unknown>) => void>) {
  if (p.channels.has(topic)) return;
  let ch = p.sb.channel(topic, { config: { private: true } });
  for (const [event, fn] of Object.entries(events)) ch = ch.on("broadcast", { event }, ({ payload }) => fn(payload as Record<string, unknown>));
  ch.subscribe((status) => {
    if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") notes.push(`${p.label}: canal ${topic.split(":")[0]} ${status}`);
  });
  p.channels.set(topic, ch);
}

function recordPhase(p: Player, matchId: string, pen: Penal) {
  // La segunda chance conserva `started_at` y estira el `deadline`: la fase se identifica por el deadline y su
  // inicio real es deadline - duración de la fase.
  const key = `${pen.penalty_id}@${pen.deadline}`;
  if (p.phases.has(key)) return;
  const prev = [...p.phases.values()].at(-1);
  const secondChance = prev?.penaltyId === pen.penalty_id;
  const deadline = ms(pen.deadline);
  const start = deadline - (secondChance ? TIMING.secondChanceS : TIMING.penaltyS) * 1000;
  const phase = { matchId, penaltyId: pen.penalty_id, idx: pen.idx, start, deadline };
  p.phases.set(key, phase);
  p.lastProgress = Date.now();
  if (!prev) return;
  const s = (phase.start - prev.deadline) / 1000;
  const where = `${p.label} ${matchId.slice(0, 8)} penal ${prev.idx}→${phase.idx}`;
  if (prev.matchId !== matchId) gaps.push({ kind: "match", s, where });
  else if (prev.penaltyId === phase.penaltyId) gaps.push({ kind: "second_chance", s, where });
  else gaps.push({ kind: "penal", s, where });
}

async function answerLater(p: Player, pen: Penal, delayMs: number) {
  await sleep(Math.max(0, delayMs));
  const pick = pickOption(pen, p.accuracy);
  if (pick.unknown) notes.push(`pregunta fuera del catálogo: "${pen.prompt}"`);
  const { error } = await p.sb.rpc("select_option", { p_penalty: pen.penalty_id, p_option: pick.index });
  if (error && !/already_answered|out_of_window/.test(error.message)) notes.push(`${p.label} select_option: ${error.message}`);
}

async function play(p: Player, deadline: number) {
  const answered = new Set<string>();
  const resolvePoked = new Set<string>();
  let nullSince: number | null = null;
  let lastWatchdog = 0;
  let presented = false;
  while (!p.done && Date.now() < deadline) {
    const am = await rpc<ActiveMatch>(p.sb, "get_active_match").catch((e: Error) => {
      notes.push(`${p.label} get_active_match: ${e.message}`);
      return undefined;
    });
    if (am === undefined) {
      await sleep(1000);
      continue;
    }
    if (!am) {
      // Antes de arrancar (sala en espera) también da null: "terminó" solo si ya jugó.
      nullSince ??= Date.now();
      if (presented && Date.now() - nullSince > DONE_AFTER_NULL_MS) p.done = true;
      await sleep(1000);
      continue;
    }
    nullSince = null;
    const tid = am.tournament_id;
    if (!presented) {
      presented = true;
      p.lastProgress = Date.now();
      await rpc(p.sb, "begin_presentation", { p_tournament: tid }).catch(() => undefined);
      subscribe(p, `tournament:${tid}`, {
        "round:next": (payload) => {
          const openAt = ms(String(payload.open_at));
          const offset = ms(String(payload.server_now)) - Date.now();
          roundNext.push({ at: ms(String(payload.server_now)), openAt });
          setTimeout(() => poke(p.sb, "open_next_round", { p_tournament: tid }), Math.max(0, openAt - (Date.now() + offset)));
        },
      });
    }
    subscribe(p, `match:${am.match_id}`, {
      // Latencia del broadcast: llegada (en hora del server, con el offset del poll) - apertura del penal.
      "penal:start": (payload) => broadcastLagMs.push(Date.now() + p.offset - ms(String(payload.started_at))),
    });
    const pen = am.penal;
    if (pen) {
      p.offset = ms(pen.server_now) - Date.now();
      recordPhase(p, am.match_id, pen);
      const remaining = ms(pen.deadline) - (Date.now() + p.offset);
      const key = `${pen.penalty_id}@${pen.deadline}`;
      if (!answered.has(key) && pen.my_option == null && remaining > 300) {
        answered.add(key);
        void answerLater(p, pen, Math.min(rand(1000, 7000), remaining - 300));
      }
      // Como el cliente real: poke agendado EXACTO al deadline (no al próximo poll).
      if (!resolvePoked.has(key)) {
        resolvePoked.add(key);
        setTimeout(() => poke(p.sb, "resolve_penalty", { p_penalty: pen.penalty_id }), Math.max(0, remaining + 50));
      }
    }
    // Watchdog del cliente (como PenalLive): sin fase nueva más allá del hueco esperado → poke.
    const idle = Date.now() - p.lastProgress;
    if (idle > (TIMING.penaltyS + TIMING.betweenPenalsS + 3) * 1000 && Date.now() - lastWatchdog > 3000) {
      lastWatchdog = Date.now();
      poke(p.sb, "open_next_round", { p_tournament: tid });
    }
    if (idle > STALL_MS) {
      failures.push(`${p.label}: ${Math.round(idle / 1000)} s sin fase nueva con el partido vivo (${am.match_id.slice(0, 8)}, fase ${am.phase})`);
      p.lastProgress = Date.now();
    }
    await sleep(1000);
  }
}

async function main() {
  const { url, key } = loadEnv();
  console.log(`load-sim contra ${new URL(url).host} · ${PLAYERS} jugadores · ${MAX_MINUTES} min máx`);
  mkdirSync(outDir, { recursive: true });
  // Un archivo de sesiones por proyecto (local y prod no comparten tokens).
  const sessionsFile = join(outDir, `load-sim.${new URL(url).hostname.split(".")[0]}.sessions.json`);
  const saved: Record<string, string> = existsSync(sessionsFile) ? JSON.parse(readFileSync(sessionsFile, "utf8")) : {};
  const players = await Promise.all(Array.from({ length: PLAYERS }, (_, i) => signIn(url, key, saved, i)));
  const persist = async () => {
    const out: Record<string, string> = {};
    for (const p of players) {
      const { data } = await p.sb.auth.getSession();
      if (data.session) out[p.label] = data.session.refresh_token;
    }
    writeFileSync(sessionsFile, JSON.stringify(out, null, 2));
  };
  await persist();
  console.log(`ids (para qa_keep): ${players.map((p) => p.userId).join(",")}`);

  // Entran todos casi juntos: deberían caer en la MISMA sala (quick_play une a la que más humanos tiene).
  const t0 = Date.now();
  for (const p of players) {
    const [room] = await rpc<{ tournament_id: string; code: string }[]>(p.sb, "quick_play", { p_mode: "worldcup" });
    p.tournamentId = room?.tournament_id ?? null;
    await sleep(200);
  }
  const tournaments = new Set(players.map((p) => p.tournamentId));
  if (tournaments.size > 1) failures.push(`los ${PLAYERS} quedaron repartidos en ${tournaments.size} salas`);
  console.log(`en sala(s): ${[...tournaments].map((t) => t?.slice(0, 8)).join(", ")} (${Math.round((Date.now() - t0) / 1000)} s)`);

  const deadline = Date.now() + MAX_MINUTES * 60_000;
  const progress = setInterval(() => {
    const live = players.filter((p) => !p.done).length;
    const phases = players.reduce((s, p) => s + p.phases.size, 0);
    console.log(`… ${live}/${PLAYERS} jugando · ${phases} fases vistas · ${gaps.length} huecos · ${failures.length} fallas`);
  }, 30_000);
  await Promise.all(players.map((p) => play(p, deadline)));
  clearInterval(progress);
  await persist();
  for (const p of players) for (const ch of p.channels.values()) await p.sb.removeChannel(ch);

  const unfinished = players.filter((p) => !p.done);
  if (unfinished.length) failures.push(`${unfinished.length} jugadores seguían en partido al cumplirse ${MAX_MINUTES} min`);
  const expected = TIMING.betweenPenalsS;
  const penalGaps = gaps.filter((g) => g.kind === "penal");
  // Desglose: para cada fase, el último round:next anterior a su apertura → (round:next.at - deadline previo) es lo
  // que tardó el server en cerrar la ronda, y (apertura - open_at) lo que tardó en abrirse el penal.
  const closeLag: number[] = [];
  const openLag: number[] = [];
  for (const p of players) {
    const phases = [...p.phases.values()];
    for (let i = 1; i < phases.length; i++) {
      const prev = phases[i - 1]!;
      const cur = phases[i]!;
      if (prev.matchId !== cur.matchId) continue;
      const rn = roundNext.filter((r) => r.at >= prev.deadline - 500 && r.openAt <= cur.start + 500).at(-1);
      if (!rn) continue;
      closeLag.push((rn.at - prev.deadline) / 1000);
      openLag.push((cur.start - rn.openAt) / 1000);
    }
  }
  // Barrera por penal (SPEC §3): una segunda chance en CUALQUIER partido de la ronda hace esperar a todos
  // `secondChanceS` más. Eso es diseño; falla solo lo que excede incluso ese caso.
  const worst = expected + TIMING.secondChanceS;
  for (const g of penalGaps) if (g.s > worst + SLACK_S) failures.push(`hueco de ${g.s.toFixed(2)} s entre penales (${g.where}; máximo ${worst} s)`);
  const barrierShare = penalGaps.filter((g) => g.s > expected + SLACK_S).length / Math.max(1, penalGaps.length);
  const stat = (xs: number[]) =>
    xs.length ? `n=${xs.length} · mín ${Math.min(...xs).toFixed(2)} · p50 ${percentile(xs, 50).toFixed(2)} · p95 ${percentile(xs, 95).toFixed(2)} · máx ${Math.max(...xs).toFixed(2)}` : "sin datos";

  const report = [
    `# Load sim — ${new Date().toISOString()}`,
    "",
    `Contra \`${new URL(url).host}\`: ${PLAYERS} invitados en ${tournaments.size} sala(s), ${Math.round((Date.now() - t0) / 60_000)} min.`,
    "",
    `## Fallas (${failures.length})`,
    ...(failures.length ? [...new Set(failures)].map((f) => `- ${f}`) : ["- ninguna"]),
    "",
    "## Tiempos (s, timestamps del server)",
    `- Hueco entre penales del mismo partido (esperado ${expected}; ${worst} si hubo segunda chance en la ronda): ${stat(penalGaps.map((g) => g.s))}`,
    `- Huecos estirados por la barrera de segunda chance: ${Math.round(barrierShare * 100)} %`,
    `- Segunda chance (deadline → reapertura): ${stat(gaps.filter((g) => g.kind === "second_chance").map((g) => g.s))}`,
    `- Entre partidos: ${stat(gaps.filter((g) => g.kind === "match").map((g) => g.s))}`,
    `- Latencia del broadcast \`penal:start\` (ms): ${stat(broadcastLagMs)}`,
    `- Cierre de ronda (deadline → \`round:next\`, s): ${stat(closeLag)} · round:next recibidos: ${roundNext.length}`,
    `- Apertura (open_at → penal abierto, s): ${stat(openLag)}`,
    "",
    "## Latencia de RPC",
    ...latencyTable(),
    "",
    `## Notas (${new Set(notes).size})`,
    ...[...new Set(notes)].slice(0, 60).map((n) => `- ${n}`),
  ].join("\n");
  writeFileSync(reportFile, report);
  console.log(`\nReporte: ${reportFile}\nFallas: ${failures.length}`);
  process.exit(failures.length ? 1 : 0);
}

void main();
