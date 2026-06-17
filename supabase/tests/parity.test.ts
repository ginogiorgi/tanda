// 9.0(d) — Paridad TS↔SQL VIVA. Corremos las funciones del motor portadas a plpgsql y las
// comparamos, en el mismo test, contra `lib/engine` (la fuente de la regla). Sin golden values
// hardcodeados: si un port driftea del motor TS, el test se pone rojo. Cubre las funciones puras;
// el bracket (engine_group_standings/build_knockout) se valida por invariantes en el e2e.
import { afterAll, describe, expect, it } from "vitest";
import { getPool, closePool } from "./_db";
import { makeRng } from "../../lib/engine/rng";
import { botIntent, type DifficultyTier } from "../../lib/engine/bot";
import { penaltyDifficulty, type Phase } from "../../lib/engine/difficulty";
import { advanceMatch, type MatchKind } from "../../lib/engine/match";

afterAll(closePool);

const TIERS: DifficultyTier[] = ["elite", "high", "medium", "low"];
const PHASES: Phase[] = [
  "group",
  "round_of_32",
  "round_of_16",
  "quarters",
  "semis",
  "third_place",
  "final",
];

// Mezcla de seeds: bordes (0, 1, 2^32-1, la constante de mulberry, la golden ratio) + un barrido.
const SEEDS: number[] = [
  0, 1, 2, 7, 42, 255, 12345, 65535, 1831565813, 2654435769, 4294967294, 4294967295,
];
for (let s = 0; s < 300; s++) SEEDS.push(((s * 2654435761) >>> 0) ^ (s * 97));

describe("paridad mulberry32 (engine_mulberry32 ↔ makeRng)", () => {
  it("bit-perfect: el entero SQL == makeRng(seed)() * 2^32 para todos los seeds", async () => {
    const c = await getPool().connect();
    try {
      const { rows } = await c.query<{ seed: string; out: string }>(
        `select s as seed, public.engine_mulberry32(s) as out
           from unnest($1::bigint[]) as s`,
        [SEEDS],
      );
      const sqlBySeed = new Map(rows.map((r) => [Number(r.seed), Number(r.out)]));
      let mismatches = 0;
      for (const seed of SEEDS) {
        const expected = makeRng(seed)() * 4294967296; // entero exacto < 2^53
        if (sqlBySeed.get(seed) !== expected) mismatches++;
      }
      expect(mismatches).toBe(0);
    } finally {
      c.release();
    }
  });
});

describe("paridad bot_intent (engine_bot_intent ↔ botIntent §7.2)", () => {
  it("willBeCorrect y delayMs coinciden para tier × seed", async () => {
    const c = await getPool().connect();
    try {
      let mismatches = 0;
      for (const tier of TIERS) {
        const { rows } = await c.query<{
          seed: string;
          will_be_correct: boolean;
          delay_ms: number;
        }>(
          `select s as seed, bi.will_be_correct, bi.delay_ms
             from unnest($1::bigint[]) as s,
                  lateral public.engine_bot_intent($2::public.difficulty_tier, s) as bi`,
          [SEEDS, tier],
        );
        const bySeed = new Map(rows.map((r) => [Number(r.seed), r]));
        for (const seed of SEEDS) {
          const ts = botIntent(tier, seed);
          const sql = bySeed.get(seed)!;
          if (
            sql.will_be_correct !== ts.willBeCorrect ||
            sql.delay_ms !== ts.delayMs
          ) {
            mismatches++;
          }
        }
      }
      expect(mismatches).toBe(0);
    } finally {
      c.release();
    }
  });
});

describe("paridad penalty_difficulty (tanda_penalty_difficulty ↔ penaltyDifficulty §9.3)", () => {
  it("coincide para las 7 fases × idx 1..7 (incl. muerte súbita)", async () => {
    const c = await getPool().connect();
    try {
      let mismatches = 0;
      for (const phase of PHASES) {
        for (let idx = 1; idx <= 7; idx++) {
          const { rows } = await c.query<{ d: string }>(
            `select public.tanda_penalty_difficulty($1::public.match_phase, $2) as d`,
            [phase, idx],
          );
          if (rows[0]!.d !== penaltyDifficulty(phase, idx)) mismatches++;
        }
      }
      expect(mismatches).toBe(0);
    } finally {
      c.release();
    }
  });
});

describe("paridad fnv32 (engine_fnv32 ↔ hashStr FNV-1a, tournament.ts:117)", () => {
  // Referencia inline: réplica exacta de `hashStr` (privada en tournament.ts). El mismo hash
  // alimenta drawKey, que el bracket usa para el sorteo determinista.
  function fnv1a(s: string): number {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  it("coincide para uuids y letras de grupo", async () => {
    const c = await getPool().connect();
    try {
      const samples = [
        "A",
        "L",
        "group-a",
        "11111111-1111-1111-1111-111111111111",
        "9f8b7c6d-0000-4000-8000-abcdefabcdef",
        "",
        "Argentina",
      ];
      let mismatches = 0;
      for (const s of samples) {
        const { rows } = await c.query<{ h: string }>(
          `select public.engine_fnv32($1) as h`,
          [s],
        );
        if (Number(rows[0]!.h) !== fnv1a(s)) mismatches++;
      }
      expect(mismatches).toBe(0);
    } finally {
      c.release();
    }
  });
});

describe("paridad advance_match (engine_advance_match ↔ advanceMatch, 10.4/10.9)", () => {
  it("status/winner/next coinciden por fase × secuencia (grupos 3-por-lado, elim 5)", async () => {
    // Enumeración completa de secuencias cortas (2^len ≤ 512) + muestreo determinista de las largas,
    // para ambas fases. Cubre regulación (grupos n≤6, elim n≤10), corte anticipado y muerte súbita.
    const cases: { kind: MatchKind; scored: boolean[] }[] = [];
    for (const kind of ["group", "elimination"] as const) {
      const reg = kind === "group" ? 6 : 10;
      for (let len = 0; len <= reg + 2; len++) {
        if (1 << len <= 512) {
          for (let mask = 0; mask < 1 << len; mask++) {
            const s: boolean[] = [];
            for (let b = 0; b < len; b++) s.push(Boolean(mask & (1 << b)));
            cases.push({ kind, scored: s });
          }
        } else {
          for (let k = 0; k < 256; k++) {
            const s: boolean[] = [];
            let m = (k * 2654435761) >>> 0;
            for (let b = 0; b < len; b++) {
              s.push(Boolean(m & 1));
              m = (m * 1103515245 + 12345) >>> 0;
            }
            cases.push({ kind, scored: s });
          }
        }
      }
    }

    const kinds = cases.map((c) => c.kind);
    const seqs = cases.map((c) => c.scored.map((x) => (x ? "T" : "F")).join(""));

    const c = await getPool().connect();
    try {
      const { rows } = await c.query<{
        i: number;
        status: string;
        winner: string | null;
        next_index: number | null;
        next_kicker: string | null;
        home: number;
        away: number;
      }>(
        `select g.i, r.status, r.winner, r.next_index, r.next_kicker, r.home, r.away
           from generate_series(1, array_length($1::text[], 1)) g(i)
           cross join lateral public.engine_advance_match(
             ($1::text[])[g.i],
             case when ($2::text[])[g.i] = '' then '{}'::boolean[]
                  else (select array_agg(ch = 'T' order by o)
                          from unnest(string_to_array(($2::text[])[g.i], null))
                               with ordinality as u(ch, o)) end
           ) r`,
        [kinds, seqs],
      );

      let mismatches = 0;
      for (const row of rows) {
        const { kind, scored } = cases[row.i - 1]!;
        const ts = advanceMatch(kind, scored);
        if (ts.status !== row.status) {
          mismatches++;
          continue;
        }
        if (ts.status === "finished") {
          const sqlWinner = row.winner ?? null;
          if (ts.home !== row.home || ts.away !== row.away || ts.winner !== sqlWinner) mismatches++;
        } else {
          if (ts.nextIndex !== row.next_index || ts.nextKicker !== row.next_kicker) mismatches++;
        }
      }
      expect({ cases: cases.length, mismatches }).toEqual({ cases: cases.length, mismatches: 0 });
    } finally {
      c.release();
    }
  });
});
