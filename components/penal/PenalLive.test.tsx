import { act, render, screen } from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MatchScene, PenalResultPayload, PenalStartPayload } from "@/lib/realtime/penal";
import type { ParticipantBrief } from "@/lib/realtime/score";
import { REVEAL_MS } from "@/lib/engine/timing";

/**
 * Feedback 4 #12/#14: el visor 3D se monta UNA vez por partido. Antes, cada fase del penal devolvía la
 * escena en otra posición del árbol → React remontaba el Canvas (pantallazo claro) y la jugada arrancaba
 * de nuevo al aparecer el cartel. Este test cuenta montajes reales del viewer a lo largo del ciclo.
 */

const mounts = { n: 0, results: [] as (string | null)[] };
vi.mock("@/components/penal/PenalSceneViewer", () => ({
  PenalSceneViewer: ({ result }: { result?: { id: string } | null }) => {
    useEffect(() => {
      mounts.n++;
    }, []);
    mounts.results.push(result?.id ?? null);
    return <div data-testid="viewer" />;
  },
}));
vi.mock("@/lib/audio", () => ({
  playGood: vi.fn(),
  playBad: vi.fn(),
  playWhistle: vi.fn(),
  setMuted: vi.fn(),
  unlockAudio: vi.fn(),
}));
vi.mock("@/lib/nav/useNav", () => ({ useNav: () => ({ push: vi.fn(), leave: vi.fn() }) }));

type Handler = (msg: { payload: unknown }) => void;
const handlers = new Map<string, Handler>();
let onStatus: ((status: string) => void) | null = null;
let active: { penal: PenalStartPayload | null; gone?: boolean } = { penal: null };
const rpcCalls: string[] = [];
let channelsCreated = 0;
let pendingResult: PenalResultPayload | null = null;

const brief = (id: string): ParticipantBrief => ({
  participant_id: id,
  user_id: null,
  is_bot: id === "p2",
  team_id: null,
  team_code: id === "p1" ? "ARG" : "BRA",
  team_name: id === "p1" ? "Argentina" : "Brasil",
  team_short: null,
  flag: null,
  crest: null,
  kit_primary: "#ffffff",
  kit_secondary: null,
  kit_tertiary: null,
  kit_pattern: null,
  accent: null,
});
const scene: MatchScene = {
  match_id: "m1",
  my_participant_id: "p1",
  home: brief("p1"),
  away: brief("p2"),
  home_avatar: null,
  away_avatar: null,
};

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => {
    const channel = {
      on(_t: string, { event }: { event: string }, h: Handler) {
        handlers.set(event, h);
        return channel;
      },
      subscribe(cb?: (status: string) => void) {
        onStatus = cb ?? null;
        cb?.("SUBSCRIBED");
        return channel;
      },
    };
    const rpcResult = (name: string): unknown => {
      if (name === "get_match_scene") return scene;
      if (name === "get_match_penals") return [];
      if (name === "get_active_match")
        return active.gone
          ? null
          : { tournament_id: "t", match_id: "m1", phase: "group", home_score: 0, away_score: 0, penal: active.penal };
      if (name === "get_penalty_result") return pendingResult;
      return null;
    };
    return {
      auth: {
        getSession: async () => ({ data: { session: null } }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => undefined } } }),
      },
      realtime: { setAuth: async () => undefined },
      channel: () => {
        channelsCreated++;
        return channel;
      },
      removeChannel: async () => undefined,
      rpc: (name: string) => {
        rpcCalls.push(name);
        return Promise.resolve({ data: rpcResult(name), error: null });
      },
    };
  },
}));

const { PenalLive } = await import("./PenalLive");

function start(id: string, idx: number): PenalStartPayload {
  const now = Date.now();
  return {
    penalty_id: id,
    match_id: "m1",
    idx,
    prompt: `Pregunta ${idx}`,
    options: ["A", "B", "C"],
    started_at: new Date(now).toISOString(),
    deadline: new Date(now + 10_000).toISOString(),
    server_now: new Date(now).toISOString(),
    phase: "first",
    kicker_participant_id: idx % 2 ? "p1" : "p2",
    keeper_participant_id: idx % 2 ? "p2" : "p1",
  };
}
function result(id: string, idx: number): PenalResultPayload {
  return {
    penalty_id: id,
    match_id: "m1",
    idx,
    outcome: "resolved",
    winner: "kicker",
    scored: true,
    reason: "goal",
    variant: 1,
    phase: "first",
    correct_index: 0,
    home_score: 1,
    away_score: 0,
    won_by_speed: false,
    kicker_participant_id: "p1",
    keeper_participant_id: "p2",
    kicker_selected_at: null,
    keeper_selected_at: null,
  };
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  mounts.n = 0;
  mounts.results = [];
  handlers.clear();
  active = { penal: start("pen1", 1) };
  rpcCalls.length = 0;
  channelsCreated = 0;
  pendingResult = null;
});
afterEach(() => vi.useRealTimers());

describe("PenalLive: la escena no se remonta entre fases (feedback 4 #12/#14)", () => {
  it("pregunta → jugada → cartel → próximo penal: un solo montaje y la jugada no se reinicia", async () => {
    render(<PenalLive matchId="m1" />);
    await screen.findByText("Pregunta 1");
    expect(screen.queryByText(/Penal Nº/)).toBeNull(); // #13
    expect(screen.getByTestId("mute-balloon")).toBeVisible(); // #15

    act(() => handlers.get("penal:result")!({ payload: result("pen1", 1) }));
    expect(screen.getByTestId("penal-playing")).toBeInTheDocument();
    expect(screen.getByTestId("mute-balloon")).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(REVEAL_MS + 50);
    });
    expect(screen.getByTestId("penal-result-card")).toBeInTheDocument();
    // La jugada que ve el cartel es la MISMA (mismo id de animación, sin volver a null en el medio).
    const sinceResult = mounts.results.slice(mounts.results.indexOf("pen1"));
    expect(sinceResult.every((r) => r === "pen1")).toBe(true);

    act(() => handlers.get("penal:start")!({ payload: start("pen2", 2) }));
    await screen.findByText("Pregunta 2");
    expect(mounts.n).toBe(1);
  });

  it("rehidratar con un penal NUEVO descarta el cartel viejo (punto 20: no quedar colgado)", async () => {
    render(<PenalLive matchId="m1" />);
    await screen.findByText("Pregunta 1");
    act(() => handlers.get("penal:result")!({ payload: result("pen1", 1) }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(REVEAL_MS + 50);
    });
    expect(screen.getByTestId("penal-result-card")).toBeInTheDocument();
    // Se perdió el `penal:start` del 2 (socket caído): al reconectar, la rehidratación trae el penal nuevo.
    active = { penal: start("pen2", 2) };
    await act(async () => {
      onStatus!("SUBSCRIBED");
    });
    await screen.findByText("Pregunta 2");
    expect(screen.queryByTestId("penal-result-card")).toBeNull();
  });
});

describe("PenalLive: robustez (feedback 4 F)", () => {
  it("el penal del poll del padre se adopta si es más nuevo; uno viejo no pisa el cartel", async () => {
    const { rerender } = render(<PenalLive matchId="m1" />);
    await screen.findByText("Pregunta 1");
    act(() => handlers.get("penal:result")!({ payload: result("pen1", 1) }));
    // Poll que salió antes del resultado: trae el penal 1 todavía abierto → se ignora.
    rerender(<PenalLive matchId="m1" serverPenal={start("pen1", 1)} />);
    expect(screen.getByTestId("penal-playing")).toBeInTheDocument();
    // Se perdió el `penal:start` del 2: lo trae el poll.
    rerender(<PenalLive matchId="m1" serverPenal={start("pen2", 2)} />);
    await screen.findByText("Pregunta 2");
  });

  it("canal caído → se vuelve a suscribir con backoff y rehidrata", async () => {
    render(<PenalLive matchId="m1" />);
    await screen.findByText("Pregunta 1");
    expect(channelsCreated).toBe(1);
    active = { penal: start("pen2", 2) };
    await act(async () => {
      onStatus!("CHANNEL_ERROR");
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1100);
    });
    expect(channelsCreated).toBe(2);
    await screen.findByText("Pregunta 2");
  });

  it("watchdog: sin penal:start pasado el hueco + 3 s, rehidrata y pokea open_next_round", async () => {
    render(<PenalLive matchId="m1" />);
    await screen.findByText("Pregunta 1");
    act(() => handlers.get("penal:result")!({ payload: result("pen1", 1) }));
    active = { penal: null }; // el server todavía no abrió el 2
    rpcCalls.length = 0;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(8600);
    });
    expect(rpcCalls).toContain("get_active_match");
    expect(rpcCalls).toContain("open_next_round");
    active = { penal: start("pen2", 2) };
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3100);
    });
    await screen.findByText("Pregunta 2");
  });

  it("watchdog: vencido el deadline sin resultado, resuelve y trae el resultado por RPC", async () => {
    render(<PenalLive matchId="m1" />);
    await screen.findByText("Pregunta 1");
    pendingResult = null;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(16_000); // el fallback de 5 intentos ya se rindió
    });
    pendingResult = result("pen1", 1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4500);
    });
    expect(rpcCalls.filter((n) => n === "resolve_penalty").length).toBeGreaterThanOrEqual(2);
    expect(mounts.results.at(-1)).toBe("pen1"); // la jugada del resultado traído por el watchdog
    expect(screen.queryByText("Pregunta 1")).toBeNull();
  });

  it("trabado sin arreglo (el server dice partido vivo y nada avanza) → pantalla de error", async () => {
    const fetchMock = vi.fn(() => Promise.resolve(new Response("{}")));
    vi.stubGlobal("fetch", fetchMock);
    render(<PenalLive matchId="m1" />);
    await screen.findByText("Pregunta 1");
    act(() => handlers.get("penal:result")!({ payload: result("pen1", 1) }));
    active = { penal: null };
    await act(async () => {
      await vi.advanceTimersByTimeAsync(47_000);
    });
    expect(await screen.findByTestId("error-screen")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith("/api/feedback", expect.objectContaining({ method: "POST" }));
    vi.unstubAllGlobals();
  });

  it("si el partido terminó (get_active_match null), el watchdog no muestra error", async () => {
    render(<PenalLive matchId="m1" />);
    await screen.findByText("Pregunta 1");
    act(() => handlers.get("penal:result")!({ payload: result("pen1", 1) }));
    active = { penal: null, gone: true };
    await act(async () => {
      await vi.advanceTimersByTimeAsync(50_000);
    });
    expect(screen.queryByTestId("error-screen")).toBeNull();
    expect(rpcCalls).not.toContain("open_next_round");
  });
});
