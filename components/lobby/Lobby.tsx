"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import {
  formatRemaining,
  presenceMembers,
  type LobbyMember,
  type LobbyPresence,
} from "@/lib/lobby/presence";

type LobbyProps = {
  code: string;
  startsAt: string;
  serverNow: string;
  userId: string;
  username: string;
};

export function Lobby({ code, startsAt, serverNow, userId, username }: LobbyProps) {
  const router = useRouter();
  const [supabase] = useState(() => createClient());
  const [members, setMembers] = useState<LobbyMember[]>([]);
  const [remaining, setRemaining] = useState<number>(() =>
    Math.max(0, new Date(startsAt).getTime() - new Date(serverNow).getTime()),
  );
  const [leaving, setLeaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const channelRef = useRef<RealtimeChannel | null>(null);

  // Presence: cada cliente trackea su {userId, username}; todos ven el estado sincronizado.
  useEffect(() => {
    const channel = supabase.channel(`room:${code}`, {
      config: { presence: { key: userId } },
    });
    channelRef.current = channel;

    channel
      .on("presence", { event: "sync" }, () => {
        setMembers(presenceMembers(channel.presenceState<LobbyPresence>()));
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await channel.track({ userId, username, online_at: Date.now() });
        }
      });

    return () => {
      void supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [supabase, code, userId, username]);

  // Countdown contra el deadline del server (offset estimado una vez al montar). El arranque
  // real del torneo lo decide el server (start_tournament, F5); acá solo se dibuja.
  useEffect(() => {
    const offset = new Date(serverNow).getTime() - Date.now();
    const deadline = new Date(startsAt).getTime();
    const tick = () => setRemaining(Math.max(0, deadline - (Date.now() + offset)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [startsAt, serverNow]);

  // Al vencer el countdown, el server arma el torneo (start_tournament, disparado por el 48º join o
  // por tick()). Acá hacemos polling de `get_active_match` y, cuando aparece el partido, vamos a la
  // pantalla de partido. Es el puente lobby → partido (8.2).
  const started = remaining <= 0;
  useEffect(() => {
    if (!started) return;
    let active = true;
    const poll = async () => {
      const { data } = await supabase.rpc("get_active_tournament");
      if (!active) return;
      if ((data as { tournament_id?: string } | null)?.tournament_id) {
        router.push("/partido");
      }
    };
    void poll();
    const id = setInterval(() => void poll(), 1500);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [started, supabase, router]);

  async function onLeave() {
    setLeaving(true);
    if (channelRef.current) await supabase.removeChannel(channelRef.current);
    await supabase.rpc("leave_room", { p_code: code });
    router.push("/");
    router.refresh();
  }

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Sin clipboard (contexto inseguro): el código ya está visible en pantalla.
    }
  }

  return (
    <div className="flex w-full max-w-md flex-col items-center gap-8">
      <div className="flex flex-col items-center gap-2 text-center">
        <span className="text-sm font-medium uppercase tracking-[0.3em] text-fg-subtle">
          Sala de espera
        </span>
        <button
          onClick={onCopy}
          className="font-mono text-5xl font-extrabold tracking-[0.2em] text-gold transition-opacity hover:opacity-80"
          title="Copiar código"
        >
          {code}
        </button>
        <span className="text-xs text-fg-subtle">
          {copied ? "¡Código copiado!" : "Tocá el código para copiarlo y compartilo"}
        </span>
      </div>

      <div className="flex flex-col items-center gap-1">
        {started ? (
          <p className="text-lg font-semibold text-fg">Armando torneo…</p>
        ) : (
          <>
            <span className="font-mono text-4xl font-bold tabular-nums text-fg">
              {formatRemaining(remaining)}
            </span>
            <span className="text-xs text-fg-subtle">
              Arranca solo cuando termine la cuenta
            </span>
          </>
        )}
      </div>

      <div className="w-full rounded-xl border border-border bg-bg-elevated p-4">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-sm font-medium text-fg-muted">Conectados</span>
          <span className="text-sm font-semibold text-gold">{members.length}</span>
        </div>
        <ul className="flex flex-col gap-2">
          {members.length === 0 ? (
            <li className="text-sm text-fg-subtle">Conectando…</li>
          ) : (
            members.map((m) => (
              <li key={m.userId} className="flex items-center gap-2 text-sm text-fg">
                <span className="h-2 w-2 rounded-full bg-success" aria-hidden />
                <span>{m.username}</span>
                {m.userId === userId && (
                  <span className="text-xs text-fg-subtle">(vos)</span>
                )}
              </li>
            ))
          )}
        </ul>
      </div>

      <button
        onClick={onLeave}
        disabled={leaving}
        className="rounded-lg border border-border px-6 py-3 font-medium text-fg transition-colors hover:border-fg-subtle disabled:opacity-50"
      >
        {leaving ? "Saliendo…" : "Salir"}
      </button>
    </div>
  );
}
