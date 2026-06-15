"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/** Las RPC de matchmaking devuelven `TABLE(room_id, tournament_id, code)`. */
type RoomRef = { room_id: string; tournament_id: string; code: string };

const JOIN_MESSAGES: Record<string, string> = {
  room_not_found: "No existe una sala con ese código.",
  room_cancelled: "Esa sala se canceló.",
  already_started: "Esa partida ya arrancó.",
  room_full: "Esa sala está llena.",
};

export function PlayMenu() {
  const router = useRouter();
  const [supabase] = useState(() => createClient());
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"play" | "create" | "join" | null>(null);

  async function go(
    action: "play" | "create" | "join",
    rpc: () => PromiseLike<{ data: unknown; error: { message: string } | null }>,
  ) {
    setError(null);
    setBusy(action);
    const { data, error: rpcError } = await rpc();
    if (rpcError) {
      setBusy(null);
      setError(
        JOIN_MESSAGES[rpcError.message] ?? "No se pudo. Probá de nuevo en un momento.",
      );
      return;
    }
    const ref = (data as RoomRef[])?.[0];
    if (!ref) {
      setBusy(null);
      setError("No se pudo. Probá de nuevo en un momento.");
      return;
    }
    router.push(`/sala/${ref.code}`);
  }

  return (
    <div className="flex w-full max-w-sm flex-col items-center gap-4">
      <button
        onClick={() => go("play", () => supabase.rpc("quick_play"))}
        disabled={busy !== null}
        className="w-full rounded-lg bg-gold px-6 py-4 text-lg font-bold text-bg transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {busy === "play" ? "Buscando…" : "Jugar"}
      </button>

      <button
        onClick={() => go("create", () => supabase.rpc("create_room"))}
        disabled={busy !== null}
        className="w-full rounded-lg border border-border px-6 py-3 font-medium text-fg transition-colors hover:border-fg-subtle disabled:opacity-50"
      >
        {busy === "create" ? "Creando…" : "Crear sala"}
      </button>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          const value = code.trim().toUpperCase();
          if (value.length < 6) {
            setError("El código tiene 6 caracteres.");
            return;
          }
          void go("join", () => supabase.rpc("join_room", { p_code: value }));
        }}
        className="flex w-full gap-2"
      >
        <input
          type="text"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          maxLength={6}
          placeholder="CÓDIGO"
          className="w-full rounded-lg border border-border bg-bg-elevated px-4 py-3 text-center font-mono tracking-[0.2em] text-fg outline-none transition-colors focus:border-gold"
        />
        <button
          type="submit"
          disabled={busy !== null}
          className="rounded-lg border border-border px-5 py-3 font-medium text-fg transition-colors hover:border-fg-subtle disabled:opacity-50"
        >
          {busy === "join" ? "…" : "Unirse"}
        </button>
      </form>

      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}
