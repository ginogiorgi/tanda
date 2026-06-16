"use client";

import { useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import {
  clockOffset,
  remainingMs,
  type PenalStartPayload,
} from "@/lib/realtime/penal";

type PenalLiveProps = {
  matchId: string;
};

/**
 * Suscripción al canal privado `match:{id}` y render del penal en vivo. Es la base de la
 * pantalla de penal (4.4 `select_option`, 4.6 reloj/barra fina, F8 escena 3D + tarjeta
 * premium). Acá: recibe `penal:start` (pregunta+opciones, **sin** la correcta) y dibuja un
 * contador simple contra el `deadline` del server.
 *
 * Canal **privado**: requiere `realtime.setAuth(token)` antes de suscribir; la lectura la
 * gobierna la policy `match_broadcast_select` en `realtime.messages` (solo participantes).
 */
export function PenalLive({ matchId }: PenalLiveProps) {
  const [supabase] = useState(() => createClient());
  const [penal, setPenal] = useState<PenalStartPayload | null>(null);
  const [remaining, setRemaining] = useState(0);
  const channelRef = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    let active = true;

    async function subscribe() {
      // Canal privado: el socket de Realtime necesita el access token del usuario para que
      // la policy de `realtime.messages` lo deje recibir.
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!active) return;
      if (session?.access_token) {
        await supabase.realtime.setAuth(session.access_token);
      }

      const channel = supabase.channel(`match:${matchId}`, {
        config: { private: true },
      });
      channelRef.current = channel;

      channel
        .on("broadcast", { event: "penal:start" }, ({ payload }) => {
          setPenal(payload as PenalStartPayload);
        })
        .subscribe();
    }

    void subscribe();

    return () => {
      active = false;
      if (channelRef.current) void supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    };
  }, [supabase, matchId]);

  // Contador contra el `deadline` server, corregido por el offset estimado al recibir el
  // penal (SPEC §1.3). La barra fiel y el poke a 0 son 4.6/4.6b; acá basta el contador.
  useEffect(() => {
    if (!penal) return;
    const offset = clockOffset(penal.server_now);
    const tick = () => setRemaining(remainingMs(penal.deadline, offset));
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [penal]);

  if (!penal) {
    return (
      <p className="text-sm text-fg-subtle">Esperando el penal…</p>
    );
  }

  const seconds = Math.ceil(remaining / 1000);

  return (
    <div className="flex w-full max-w-md flex-col gap-6">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium uppercase tracking-[0.2em] text-fg-subtle">
          Penal {penal.idx}
        </span>
        <span className="font-mono text-2xl font-bold tabular-nums text-gold">
          {seconds}
        </span>
      </div>

      <p className="text-balance text-center text-xl font-semibold text-fg">
        {penal.prompt}
      </p>

      <div className="flex flex-col gap-3">
        {penal.options.map((option, i) => (
          <button
            key={i}
            type="button"
            disabled
            className="rounded-xl border border-border bg-bg-elevated px-4 py-3 text-left font-medium text-fg disabled:opacity-90"
          >
            <span className="mr-3 font-mono text-fg-subtle">{i + 1}</span>
            {option}
          </button>
        ))}
      </div>
    </div>
  );
}
