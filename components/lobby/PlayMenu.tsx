"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { roomErrorMessage, GENERIC_RETRY_MESSAGE } from "@/lib/errors";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { MODE_LIST, type ModeId } from "@/lib/modes";

/** Las RPC de matchmaking devuelven `TABLE(room_id, tournament_id, code)`. */
type RoomRef = { room_id: string; tournament_id: string; code: string };
type Action = "play" | "create";

const ACTION_LABEL: Record<Action, { title: string; busy: string }> = {
  play: { title: "Jugar", busy: "Buscando…" },
  create: { title: "Crear sala", busy: "Creando…" },
};

/**
 * Menú de juego. "Jugar" y "Crear sala" despliegan el selector de MODO (escala a N modos: sale del
 * registro `lib/modes` + los activos de `game_modes`, que llegan del server). Unirse por código no
 * pregunta: el modo lo define la sala.
 */
export function PlayMenu({ activeModes }: { activeModes: readonly ModeId[] }) {
  const router = useRouter();
  const [supabase] = useState(() => createClient());
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [picking, setPicking] = useState<Action | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function go(key: string, rpc: () => PromiseLike<{ data: unknown; error: { message: string } | null }>) {
    setError(null);
    setBusy(key);
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

  function start(action: Action, mode: ModeId) {
    void go(`${action}:${mode}`, () =>
      supabase.rpc(action === "play" ? "quick_play" : "create_room", { p_mode: mode }),
    );
  }

  const toggle = (action: Action) => {
    setError(null);
    setPicking((cur) => (cur === action ? null : action));
  };

  return (
    <div className="flex w-full max-w-sm flex-col items-center gap-4">
      {(["play", "create"] as const).map((action) => (
        <div key={action} className="flex w-full flex-col gap-2">
          <Button
            onClick={() => toggle(action)}
            disabled={busy !== null}
            variant={action === "play" ? "primary" : "outline"}
            block
            size="lg"
            aria-expanded={picking === action}
            aria-controls={`modes-${action}`}
            className={action === "play" ? "h-14 text-lg font-bold" : undefined}
          >
            {ACTION_LABEL[action].title}
          </Button>

          {picking === action && (
            <div
              id={`modes-${action}`}
              role="group"
              aria-label={`Elegí el modo para ${ACTION_LABEL[action].title.toLowerCase()}`}
              className="fade-in grid grid-cols-2 gap-2"
            >
              {MODE_LIST.map((mode) => {
                const enabled = activeModes.includes(mode.id);
                const key = `${action}:${mode.id}`;
                return (
                  <button
                    key={mode.id}
                    type="button"
                    onClick={() => start(action, mode.id)}
                    disabled={!enabled || busy !== null}
                    className="flex min-h-24 flex-col items-start justify-between gap-2 rounded-xl border border-border bg-bg-elevated p-3 text-left transition-colors hover:border-gold/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <span className="font-display text-lg font-bold uppercase leading-none text-fg">
                      {busy === key ? ACTION_LABEL[action].busy : mode.name}
                    </span>
                    <span className="text-[11px] leading-snug text-fg-muted">
                      {enabled ? mode.tagline : "Próximamente"}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      ))}

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
