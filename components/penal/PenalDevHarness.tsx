"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { PenalLive } from "@/components/penal/PenalLive";

/**
 * Harness DEV (temporal, se reemplaza en F5/F8). Ejercita el flujo de la 4.3 sin
 * `start_tournament`: crea un penal de práctica (`dev_create_practice_penal`), monta
 * `<PenalLive>` suscrito al canal del match, y lo abre (`open_penalty`) para ver llegar el
 * Broadcast `penal:start` en vivo. NO es parte del flujo real del juego.
 */
type Practice = { matchId: string; penaltyId: string };

export function PenalDevHarness() {
  const [supabase] = useState(() => createClient());
  const [practice, setPractice] = useState<Practice | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onCreate() {
    setBusy(true);
    setError(null);
    const { data, error: rpcError } = await supabase.rpc(
      "dev_create_practice_penal",
    );
    setBusy(false);
    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    const row = (data as { match_id: string; penalty_id: string }[])?.[0];
    if (!row) {
      setError("Sin datos del penal de práctica");
      return;
    }
    setPractice({ matchId: row.match_id, penaltyId: row.penalty_id });
  }

  async function onOpen() {
    if (!practice) return;
    setBusy(true);
    setError(null);
    const { error: rpcError } = await supabase.rpc("open_penalty", {
      p_penalty: practice.penaltyId,
    });
    setBusy(false);
    if (rpcError) setError(rpcError.message);
  }

  return (
    <div className="flex w-full max-w-md flex-col items-center gap-6">
      <div className="flex flex-col items-center gap-1 text-center">
        <span className="text-sm font-medium uppercase tracking-[0.3em] text-fg-subtle">
          Dev · penal
        </span>
        <span className="text-xs text-fg-subtle">
          Harness temporal para probar el Broadcast (se borra en F5/F8)
        </span>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={onCreate}
          disabled={busy}
          className="rounded-lg border border-border px-5 py-2.5 font-medium text-fg transition-colors hover:border-fg-subtle disabled:opacity-50"
        >
          Crear penal de práctica
        </button>
        <button
          type="button"
          onClick={onOpen}
          disabled={busy || !practice}
          className="rounded-lg bg-gold px-5 py-2.5 font-semibold text-bg transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          Abrir penal
        </button>
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}

      {practice && <PenalLive matchId={practice.matchId} />}
    </div>
  );
}
