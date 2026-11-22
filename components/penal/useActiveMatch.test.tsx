import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { ActiveMatch, PenalStartPayload } from "@/lib/realtime/penal";
import { BACKSTOP_POKE_AFTER_MS, useActiveMatch } from "./useActiveMatch";

/**
 * Plan 5 L/Z: el poll del padre pokeaba `open_next_round` CADA segundo sin penal abierto (~4 no-op por hueco
 * entre penales y por jugador). Ahora solo pokea si pasó casi todo el hueco sin penal: el preciso es
 * `round:next` y `tick()` corre cada 1 s.
 */
let active: ActiveMatch | null = null;
const calls: string[] = [];
const supabase = {
  rpc: (fn: string) => {
    calls.push(fn);
    return Promise.resolve({ data: fn === "get_active_match" ? active : null, error: null });
  },
} as unknown as SupabaseClient<Database>;

const penal = { penalty_id: "p1", idx: 1, started_at: "2026-11-22T00:00:00Z", deadline: "2026-11-22T00:00:10Z" } as PenalStartPayload;
const pokes = () => calls.filter((c) => c === "open_next_round").length;
const tickS = async (s: number) => {
  for (let i = 0; i < s; i++) await act(() => vi.advanceTimersByTimeAsync(1000));
};

beforeEach(() => {
  vi.useFakeTimers();
  calls.length = 0;
  active = { tournament_id: "t", match_id: "m1", phase: "groups", home_score: 0, away_score: 0, penal };
});
afterEach(() => vi.useRealTimers());

describe("useActiveMatch", () => {
  it("con penal abierto: escena de penal, adopta el penal del server y no pokea", async () => {
    const { result } = renderHook(() => useActiveMatch(supabase, "t"));
    await tickS(3);
    expect(result.current.showPenal).toBe(true);
    expect(result.current.matchId).toBe("m1");
    expect(result.current.serverPenal?.penalty_id).toBe("p1");
    expect(pokes()).toBe(0);
  });

  it("hueco entre penales: el poke de respaldo recién sale al final del hueco, no cada segundo", async () => {
    renderHook(() => useActiveMatch(supabase, "t"));
    await tickS(2);
    active = { ...active!, penal: null };
    await tickS(Math.floor(BACKSTOP_POKE_AFTER_MS / 1000) - 1);
    expect(pokes()).toBe(0);
    await tickS(3);
    expect(pokes()).toBeGreaterThan(0);
  });

  it("fin del partido: suelta la escena después del linger", async () => {
    const { result } = renderHook(() => useActiveMatch(supabase, "t"));
    await tickS(2);
    active = null;
    await tickS(3);
    expect(result.current.showPenal).toBe(false);
    expect(result.current.everPlayed).toBe(true);
  });
});
