// 9.1 — Auditoría RLS + anti-trampa, codificada como guardrail durable (no un review de una vez).
import { readFileSync } from "node:fs";
import { join } from "node:path";
// Afirma a nivel rol Postgres (lo que aplica PostgREST/Realtime en prod) tres invariantes:
//   (a) RLS habilitada en TODA tabla de `public` (respaldo del event trigger ensure_rls).
//   (b) la superficie de funciones ejecutables por `authenticated`/`anon` == allowlist intencional
//       (cualquier grant accidental en una migración futura rompe el test → review consciente).
//   (c) ningún mutador autoritativo interno es ejecutable por `anon`/`authenticated`
//       (generaliza el check de 4 funciones de anticheat.test.ts a la lista completa de revocadas).
//   (d) la superficie de TABLAS legible/escribible directo por el cliente == allowlist (una por policy
//       RLS; `correct_index` y demás internos solo por RPC). Ver 20261119000000_explicit_table_grants.
import { afterAll, describe, expect, it } from "vitest";
import { closePool, query } from "./_db";

afterAll(closePool);

// Superficie ejecutable INTENCIONAL (reconciliada contra la DB en 9.1; ver migración
// 20260617130000_rls_anticheat_hardening). Editar acá obliga a justificar cualquier cambio de grant.
const AUTH_ALLOWLIST = [
  // RPCs de cliente
  "abandon",
  "begin_presentation",
  "create_room",
  "get_active_match",
  "get_active_tournament",
  "get_bracket",
  "get_fan_ranking",
  "get_match_penals",
  "get_match_scene",
  "get_penalty_result",
  "get_profile_stats",
  "get_ranked_match",
  "get_ranked_me",
  "get_ranking",
  "get_tournament_history",
  "join_room",
  "leave_room",
  "lobby_favorite",
  "open_next_round",
  "open_penalty",
  "quick_play",
  "ranked_cancel",
  "ranked_enqueue",
  "ranked_poll",
  "resolve_penalty",
  "select_option",
  "set_favorites",
  "username_available",
  // helpers de pertenencia que evalúan las policies RLS
  "is_match_member",
  "is_room_member",
  "is_tournament_member",
  "realtime_match_member",
  "realtime_tournament_member",
].sort();

/** RPC tipadas que solo llama el server con la service role (`app/api/*`); nunca el cliente. */
const SERVICE_ONLY = ["submit_feedback"];

// `anon` (sin sesión) solo necesita username_available (form de registro) y get_fan_ranking (/hinchas es
// público: lee contadores agregados, nada personal). Los helpers de pertenencia los evalúan policies
// `TO authenticated` (y RPCs definer como owner): no se exponen a anon (advisor 0028).
const ANON_ALLOWLIST = [
  "get_fan_ranking",
  "username_available",
].sort();

// Mutadores/internos autoritativos: NUNCA ejecutables por el cliente (solo dentro de RPCs SECURITY
// DEFINER que corren como owner, o por el cron). Generaliza el anti-trampa de anticheat.test.ts.
const INTERNAL_DENYLIST = [
  "start_tournament",
  "open_round",
  "open_round_penals",
  "resolve_round",
  "finalize_match",
  "progress_match",
  "open_penalty_internal",
  "advance_tournament",
  "advance_ko_round",
  "build_knockout",
  "simulate_bot_match",
  "materialize_bot_intents",
  "precompute_bot_intents",
  "assign_round_question",
  "take_tournament_question",
  "emit_score_live",
  "tick",
  "cleanup_stale_rooms",
  "gen_room_code",
  "participant_brief",
  "rls_auto_enable",
  "enforce_rate_limit",
  // helpers puros del motor (paridad TS↔SQL): no sensibles, pero revocados por least-privilege
  "engine_fnv32",
  "engine_group_standings",
  "engine_imul",
  "engine_mulberry32",
  "engine_rand_int",
  "engine_rand_bool",
  "engine_hash32",
  "engine_bot_intent",
  "engine_advance_match",
  "bot_penalty_scored",
  "tanda_penalty_difficulty",
];

// Nombres (distinct) de funciones NO-trigger de `public` ejecutables por el rol dado.
async function execNames(role: "anon" | "authenticated"): Promise<string[]> {
  const rows = await query<{ proname: string }>(
    `select distinct p.proname
       from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.prorettype <> 'pg_catalog.trigger'::regtype
        and has_function_privilege($1, p.oid, 'execute')
      order by 1`,
    [role],
  );
  return rows.map((r) => r.proname);
}

describe("RLS habilitada en toda tabla de public", () => {
  it("no hay ninguna tabla de public sin row level security", async () => {
    const rows = await query<{ relname: string }>(
      `select c.relname
         from pg_class c
         join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
        order by 1`,
    );
    // Mensaje útil: lista los infractores si alguno aparece.
    expect(rows.map((r) => r.relname)).toEqual([]);
  });
});

describe("superficie ejecutable == allowlist intencional", () => {
  it("authenticated solo ejecuta las RPC de cliente + helpers de policy + dev", async () => {
    expect(await execNames("authenticated")).toEqual(AUTH_ALLOWLIST);
  });

  it("anon solo ejecuta username_available y get_fan_ranking", async () => {
    expect(await execNames("anon")).toEqual(ANON_ALLOWLIST);
  });

  // El cliente solo puede llamar RPC tipadas (`lib/supabase/database.types.ts`, TS estricto). Si se suma
  // una RPC al tipo y no a la allowlist (ni a `…_explicit_function_grants`, que revoca todo lo demás),
  // en prod respondería "permission denied": esto lo rompe en CI antes.
  it("toda RPC tipada para el cliente está en la allowlist y es ejecutable por authenticated", async () => {
    const src = readFileSync(join(process.cwd(), "lib/supabase/database.types.ts"), "utf8");
    const block = /Functions: \{([\s\S]*?)\n {4}\};/.exec(src)?.[1] ?? "";
    const typed = [...block.matchAll(/^ {6}([a-z_]+):/gm)].map((m) => m[1]!).sort();
    expect(typed.length).toBeGreaterThan(10);
    const exec = await execNames("authenticated");
    // Tipadas para el server (service role): el cliente NO las puede ejecutar.
    for (const f of SERVICE_ONLY) {
      expect(typed).toContain(f);
      expect(exec).not.toContain(f);
    }
    const client = typed.filter((f) => !SERVICE_ONLY.includes(f));
    expect(client.filter((f) => !AUTH_ALLOWLIST.includes(f))).toEqual([]);
    expect(client.filter((f) => !exec.includes(f))).toEqual([]);
  });
});

describe("mutadores autoritativos internos: revocados a anon/authenticated", () => {
  it("ninguna función interna es ejecutable por el cliente", async () => {
    const rows = await query<{ proname: string }>(
      `select distinct p.proname
         from pg_proc p
         join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'
          and p.proname = any($1)
          and (has_function_privilege('anon', p.oid, 'execute')
            or has_function_privilege('authenticated', p.oid, 'execute'))
        order by 1`,
      [INTERNAL_DENYLIST],
    );
    // Si algo aparece acá, una migración filtró un mutador autoritativo al cliente.
    expect(rows.map((r) => r.proname)).toEqual([]);
  });

  it("la denylist matchea funciones reales (no quedó un nombre viejo sin efecto)", async () => {
    const rows = await query<{ proname: string }>(
      `select distinct p.proname
         from pg_proc p
         join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = any($1)`,
      [INTERNAL_DENYLIST],
    );
    const found = new Set(rows.map((r) => r.proname));
    const missing = INTERNAL_DENYLIST.filter((n) => !found.has(n));
    expect(missing).toEqual([]);
  });
});

// (d) Lecturas/escrituras directas por PostgREST. Las tablas de juego (penalties, questions…) NUNCA.
const AUTH_TABLE_SELECT = ["game_modes", "participants", "profiles", "rooms", "teams", "tournaments"].sort();
const ANON_TABLE_SELECT = ["game_modes"];
const AUTH_COLUMN_UPDATE = ["profiles.avatar", "profiles.username"];

describe("9.1 (d) — superficie de tablas del cliente", () => {
  it("SELECT directo de authenticated/anon == allowlist; sin INSERT/DELETE; UPDATE solo username/avatar", async () => {
    const tables = await query<{ relname: string; auth_sel: boolean; anon_sel: boolean; writes: boolean }>(
      `select c.relname,
              has_table_privilege('authenticated', c.oid, 'SELECT') as auth_sel,
              has_table_privilege('anon', c.oid, 'SELECT') as anon_sel,
              has_table_privilege('authenticated', c.oid, 'INSERT')
                or has_table_privilege('authenticated', c.oid, 'DELETE')
                or has_table_privilege('authenticated', c.oid, 'UPDATE')
                or has_table_privilege('anon', c.oid, 'INSERT')
                or has_table_privilege('anon', c.oid, 'DELETE')
                or has_any_column_privilege('anon', c.oid, 'UPDATE') as writes
         from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind in ('r', 'v', 'm')`,
    );
    expect(tables.filter((t) => t.auth_sel).map((t) => t.relname).sort()).toEqual(AUTH_TABLE_SELECT);
    expect(tables.filter((t) => t.anon_sel).map((t) => t.relname).sort()).toEqual(ANON_TABLE_SELECT);
    expect(tables.filter((t) => t.writes).map((t) => t.relname)).toEqual([]);

    const cols = await query<{ col: string }>(
      `select c.relname || '.' || a.attname as col
         from pg_attribute a
         join pg_class c on c.oid = a.attrelid
         join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind = 'r' and a.attnum > 0 and not a.attisdropped
          and has_column_privilege('authenticated', c.oid, a.attnum, 'UPDATE')
        order by 1`,
    );
    expect(cols.map((c) => c.col)).toEqual(AUTH_COLUMN_UPDATE);
  });
});
