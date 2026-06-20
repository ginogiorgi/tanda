"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { roomErrorMessage, GENERIC_RETRY_MESSAGE } from "@/lib/errors";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

/** Las RPC de matchmaking devuelven `TABLE(room_id, tournament_id, code)`. */
type RoomRef = { room_id: string; tournament_id: string; code: string };

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
      setError(roomErrorMessage(rpcError.message));
      return;
    }
    const ref = (data as RoomRef[])?.[0];
    if (!ref) {
      setBusy(null);
      setError(GENERIC_RETRY_MESSAGE);
      return;
    }
    router.push(`/sala/${ref.code}`);
  }

  return (
    <div className="flex w-full max-w-sm flex-col items-center gap-4">
      <Button
        onClick={() => go("play", () => supabase.rpc("quick_play"))}
        disabled={busy !== null}
        block
        className="h-14 text-lg font-bold"
      >
        {busy === "play" ? "Buscando…" : "Jugar"}
      </Button>

      <Button
        onClick={() => go("create", () => supabase.rpc("create_room"))}
        disabled={busy !== null}
        variant="outline"
        block
        size="lg"
      >
        {busy === "create" ? "Creando…" : "Crear sala"}
      </Button>

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
        <Input
          type="text"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          maxLength={6}
          placeholder="CÓDIGO"
          className="text-center font-mono tracking-[0.2em]"
        />
        <Button type="submit" disabled={busy !== null} variant="outline" size="lg" className="shrink-0">
          {busy === "join" ? "…" : "Unirse"}
        </Button>
      </form>

      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}
