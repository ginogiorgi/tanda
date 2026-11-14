"use client";

import { useState } from "react";
import { useNav } from "@/lib/nav/useNav";
import { createClient } from "@/lib/supabase/client";
import { roomErrorMessage, GENERIC_RETRY_MESSAGE } from "@/lib/errors";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { MODE_LIST, type ModeId } from "@/lib/modes";
import { divisionFor } from "@/lib/engine/ranked";
import type { RankedMe } from "@/lib/ranked/types";
import { DivisionCrest } from "@/components/ranked/DivisionCrest";

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
 * pregunta: el modo lo define la sala. La cola RANKED (1v1, puntos de liga) aparece SOLO en Jugar.
 */
export function PlayMenu({
  activeModes,
  ranked = null,
}: {
  activeModes: readonly ModeId[];
  /** Ficha de liga del jugador (null = no se pudo cargar; la card igual lleva a la cola). */
  ranked?: RankedMe | null;
}) {
  const router = useNav();
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
            className={action === "play" ? "h-14 text-2xl" : undefined}
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
                    className="group relative flex min-h-26 flex-col items-start justify-between gap-2 overflow-hidden rounded-[4px] border-2 border-ink bg-bg-elevated p-3 pt-4 text-left shadow-card transition-colors hover:bg-ink hover:text-bg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue motion-safe:active:translate-x-[2px] motion-safe:active:translate-y-[2px] active:shadow-press disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-bg-elevated disabled:hover:text-fg"
                  >
                    {/* Filete superior con el color del modo (sub-identidad). */}
                    <span aria-hidden className={`absolute inset-x-0 top-0 h-1.5 ${mode.swatch}`} />
                    <span className="font-display text-2xl font-extrabold uppercase leading-[0.9]">
                      {busy === key ? ACTION_LABEL[action].busy : mode.name}
                    </span>
                    <span className="text-xs font-medium leading-snug opacity-75">
                      {enabled ? mode.tagline : "Próximamente"}
                    </span>
                  </button>
                );
              })}
              {action === "play" && <RankedCard ranked={ranked} disabled={busy !== null} />}
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

      {error && <p className="text-sm font-semibold text-brand-ink">{error}</p>}
    </div>
  );
}

/** Tercera cola, solo en Jugar: ranked 1v1 con la división y los puntos del jugador. */
function RankedCard({ ranked, disabled }: { ranked: RankedMe | null; disabled: boolean }) {
  const router = useNav();
  const div = divisionFor(ranked?.rating ?? 1500);
  return (
    <button
      type="button"
      onClick={() => router.push("/ranked")}
      disabled={disabled}
      className="group col-span-2 flex items-center gap-3 rounded-[4px] border-2 border-ink bg-ink p-3 text-left text-bg shadow-card transition-colors hover:bg-bg-elevated hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue motion-safe:active:translate-x-[2px] motion-safe:active:translate-y-[2px] active:shadow-press disabled:cursor-not-allowed disabled:opacity-45"
    >
      <DivisionCrest id={div.id} className="h-12" />
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="font-display text-2xl font-extrabold uppercase leading-[0.9]">Ranked 1v1</span>
        <span className="text-xs font-medium leading-snug opacity-75">
          {div.name} · {ranked?.rating ?? 1500} pts · ganás o perdés puntos
        </span>
      </span>
      <span aria-hidden className="font-display text-2xl font-black">→</span>
    </button>
  );
}
