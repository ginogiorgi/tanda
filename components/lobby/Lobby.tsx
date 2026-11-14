"use client";

import { useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/Button";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { useNav } from "@/lib/nav/useNav";
import {
  formatRemaining,
  reconcileRoster,
  rosterMembers,
  type LobbyMember,
  type LobbyPresence,
  type RosterEntry,
} from "@/lib/lobby/presence";
import { getMode, type ModeId } from "@/lib/modes";

type LobbyProps = {
  code: string;
  modeId: ModeId;
  startsAt: string;
  serverNow: string;
  userId: string;
  username: string;
};

export function Lobby({ code, modeId, startsAt, serverNow, userId, username }: LobbyProps) {
  const mode = getMode(modeId);
  const { push: navPush, leave: navLeave } = useNav();
  const [supabase] = useState(() => createClient());
  const [members, setMembers] = useState<LobbyMember[]>([]);
  const [remaining, setRemaining] = useState<number>(() =>
    Math.max(0, new Date(startsAt).getTime() - new Date(serverNow).getTime()),
  );
  const [leaving, setLeaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const channelRef = useRef<RealtimeChannel | null>(null);
  // Roster acumulado con período de gracia → los nombres no parpadean ante churn transitorio (tarea 2).
  const rosterRef = useRef<Map<string, RosterEntry>>(new Map());

  // Presence: cada cliente trackea su {userId, username}; todos ven el estado sincronizado.
  useEffect(() => {
    const channel = supabase.channel(`room:${code}`, {
      config: { presence: { key: userId } },
    });
    channelRef.current = channel;

    // Reconcilia el roster contra el estado actual (con gracia) y publica los miembros.
    const refresh = () => {
      rosterRef.current = reconcileRoster(
        rosterRef.current,
        channel.presenceState<LobbyPresence>(),
        Date.now(),
      );
      setMembers(rosterMembers(rosterRef.current));
    };

    channel
      .on("presence", { event: "sync" }, refresh)
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await channel.track({ userId, username, online_at: Date.now() });
        }
      });

    // Tick de respaldo: descarta a los ausentes una vez vencida la gracia, aunque no llegue otro sync.
    const id = setInterval(refresh, 2000);

    return () => {
      clearInterval(id);
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

  // Al vencer el countdown, el server arma el torneo (start_tournament, disparado por el join que llena el cupo o
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
        navPush("/partido");
      }
    };
    void poll();
    // Poll rápido (700ms): apenas el server arma el torneo, saltar a /partido para no comerse parte
    // de la ventana de presentación (país + grupos) esperando el próximo tick del poll.
    const id = setInterval(() => void poll(), 700);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [started, supabase, navPush]);

  // Salir navega YA (feedback 14/11: "volver tarda un montón"); el leave corre en paralelo y, si se
  // perdiera, la sala igual arranca sin vos (quedás como desconectado: respuestas al azar).
  function onLeave() {
    setLeaving(true);
    const channel = channelRef.current;
    navLeave("/jugar", async () => {
      if (channel) await supabase.removeChannel(channel);
      await supabase.rpc("leave_room", { p_code: code });
    }, { refresh: true });
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

  // Compartir sala (8.9): Web Share API nativa; fallback a copiar el código.
  async function onShare() {
    const url = `${window.location.origin}/sala/${code}`;
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({
          title: "TANDA",
          text: `Sumate a mi partida de TANDA. Código ${code}`,
          url,
        });
        return;
      } catch {
        // El usuario canceló el diálogo o no se pudo: caemos a copiar.
      }
    }
    void onCopy();
  }

  return (
    <>
    <ScreenHeader
      onBack={onLeave}
      backLabel={leaving ? "Saliendo…" : "Salir"}
      title={`Sala · ${mode.name}`}
    />
    <div className="flex min-h-0 w-full flex-1 flex-col items-center overflow-y-auto overscroll-contain px-6 py-6">
    <div className="my-auto flex w-full max-w-md flex-col items-center gap-8">
      <div className="flex flex-col items-center gap-2 text-center">
        <span className="text-xs font-bold uppercase tracking-[0.2em] text-brand-ink">
          Sala de espera · {mode.name}
        </span>
        <button
          onClick={onCopy}
          className="font-mono text-5xl font-extrabold tracking-[0.2em] text-brand transition-opacity hover:opacity-80"
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
            <span className="font-display text-5xl font-extrabold tabular-nums text-fg">
              {formatRemaining(remaining)}
            </span>
            <span className="text-xs text-fg-subtle">
              Arranca solo cuando termine la cuenta
            </span>
          </>
        )}
      </div>

      <div className="w-full rounded-[6px] border-2 border-ink bg-bg-elevated p-4 shadow-card">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-sm font-medium text-fg-muted">Conectados</span>
          <span className="text-sm font-semibold text-brand">
            {members.length}
            <span className="font-normal text-fg-subtle">/{mode.format.roomSize}</span>
          </span>
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

      <Button onClick={onShare} size="lg" block>
        Compartir
      </Button>
    </div>
    </div>
    </>
  );
}
