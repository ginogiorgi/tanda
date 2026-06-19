// 9.1 — Auditoría RLS + anti-trampa, codificada como guardrail durable (no un review de una vez).
// Afirma a nivel rol Postgres (lo que aplica PostgREST/Realtime en prod) tres invariantes:
//   (a) RLS habilitada en TODA tabla de `public` (respaldo del event trigger ensure_rls).
//   (b) la superficie de funciones ejecutables por `authenticated`/`anon` == allowlist intencional
//       (cualquier grant accidental en una migración futura rompe el test → review consciente).
//   (c) ningún mutador autoritativo interno es ejecutable por `anon`/`authenticated`
//       (generaliza el check de 4 funciones de anticheat.test.ts a la lista completa de revocadas).
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
  "get_match_penals",
  "get_match_scene",
  "get_penalty_result",
  "get_tournament_history",
  "join_room",
  "leave_room",
  "open_next_round",
  "open_penalty",
  "quick_play",
  "resolve_penalty",
  "select_option",
  "username_available",
  // helpers de pertenencia que evalúan las policies RLS
  "is_match_member",
  "is_room_member",
  "is_tournament_member",
  "realtime_match_member",
  "realtime_tournament_member",
].sort();

// `anon` (sesión sin login) solo necesita: username_available (form de registro) + los helpers de
// pertenencia (booleanos que evalúan las policies RLS, no filtran nada).
const ANON_ALLOWLIST = [
  "username_available",
  "is_match_member",
  "is_room_member",
  "is_tournament_member",
  "realtime_match_member",
  "realtime_tournament_member",
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

  it("anon solo ejecuta username_available + helpers de pertenencia", async () => {
    expect(await execNames("anon")).toEqual(ANON_ALLOWLIST);
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
