"use client";

import { useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import {
  clockOffset,
  remainingMs,
  type PenalStartPayload,
  type PenalResultPayload,
} from "@/lib/realtime/penal";

type PenalLiveProps = {
  matchId: string;
};

/**
 * Suscripción al canal privado `match:{id}` y render del penal en vivo. Es la base de la
 * pantalla de penal (F8 escena 3D + tarjeta premium). Maneja el ciclo completo:
 * `penal:start` (pregunta sin la correcta) → `select_option` (cambiable) → poke a 0s
 * (`resolve_penalty`, SPEC §1.3) → `penal:second_chance` (2 opciones, 5s) o `penal:result`
 * (GOL/ATAJADO + revela la correcta).
 *
 * Canal **privado**: requiere `realtime.setAuth(token)` antes de suscribir; la lectura la
 * gobierna la policy `match_broadcast_select` en `realtime.messages` (solo participantes).
 */
export function PenalLive({ matchId }: PenalLiveProps) {
  const [supabase] = useState(() => createClient());
  const [penal, setPenal] = useState<PenalStartPayload | null>(null);
  const [result, setResult] = useState<PenalResultPayload | null>(null);
  const [remaining, setRemaining] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const pokedRef = useRef<string | null>(null);

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

      const onNewPhase = ({ payload }: { payload: unknown }) => {
        setPenal(payload as PenalStartPayload);
        setSelected(null); // fase nueva → arranca sin selección
        setResult(null);
      };

      channel
        .on("broadcast", { event: "penal:start" }, onNewPhase)
        .on("broadcast", { event: "penal:second_chance" }, onNewPhase)
        .on("broadcast", { event: "penal:result" }, ({ payload }) => {
          setResult(payload as PenalResultPayload);
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

  // Contador contra el `deadline` server, corregido por el offset estimado al recibir la fase
  // (SPEC §1.3). Al llegar a 0, el cliente hace el "poke": llama `resolve_penalty` una sola vez
  // por fase. El server valida `now() >= deadline` y es idempotente (no se puede adelantar).
  useEffect(() => {
    if (!penal) return;
    const offset = clockOffset(penal.server_now);
    const phaseKey = `${penal.penalty_id}:${penal.started_at}`;
    const tick = () => {
      const r = remainingMs(penal.deadline, offset);
      setRemaining(r);
      if (r <= 0 && pokedRef.current !== phaseKey) {
        pokedRef.current = phaseKey;
        void supabase.rpc("resolve_penalty", { p_penalty: penal.penalty_id });
      }
    };
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [penal, supabase]);

  // Elegir/cambiar opción: optimista en el cliente, autoritativo en el server. El server
  // registra la ÚLTIMA selección con su `selected_at` (SPEC §1.3); cambiable hasta el deadline.
  async function onSelect(option: number) {
    if (!penal || remaining <= 0) return;
    setSelected(option); // resaltado optimista
    const { error } = await supabase.rpc("select_option", {
      p_penalty: penal.penalty_id,
      p_option: option,
    });
    if (error) setSelected(null); // p. ej. `out_of_window`: el server manda
  }

  if (!penal) {
    return <p className="text-sm text-fg-subtle">Esperando el penal…</p>;
  }

  // Resuelto: GOL/ATAJADO + revela la correcta + explicación (§8.11). La animación 3D es 4.9/F8.
  if (result) {
    return (
      <div className="flex w-full max-w-md flex-col items-center gap-4 text-center">
        <span className="text-sm font-medium uppercase tracking-[0.2em] text-fg-subtle">
          Penal {result.idx} · {result.home_score}–{result.away_score}
        </span>
        <p className="text-4xl font-extrabold tracking-tight text-gold">
          {result.scored ? "¡GOL!" : "ATAJADO"}
        </p>
        <p className="text-balance text-sm text-fg-muted">{penal.prompt}</p>
        <p className="text-base font-semibold text-fg">
          Correcta: {penal.options[result.correct_index]}
        </p>
        {result.explanation && (
          <p className="text-balance text-sm text-fg-subtle">{result.explanation}</p>
        )}
      </div>
    );
  }

  const seconds = Math.ceil(remaining / 1000);
  const locked = remaining <= 0;
  const isSecondChance = penal.phase === "second_chance";

  return (
    <div className="flex w-full max-w-md flex-col gap-6">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium uppercase tracking-[0.2em] text-fg-subtle">
          Penal {penal.idx}
          {isSecondChance && " · 2ª chance"}
        </span>
        <span className="font-mono text-2xl font-bold tabular-nums text-gold">
          {seconds}
        </span>
      </div>

      <p className="text-balance text-center text-xl font-semibold text-fg">
        {penal.prompt}
      </p>

      <div className="flex flex-col gap-3">
        {penal.options.map((option, i) => {
          const isRemoved = penal.removed_option === i;
          if (isRemoved) return null; // en 2ª chance, la opción quitada no se muestra
          const isSelected = selected === i;
          return (
            <button
              key={i}
              type="button"
              onClick={() => onSelect(i)}
              disabled={locked}
              aria-pressed={isSelected}
              className={`flex items-center rounded-xl border px-4 py-3 text-left font-medium transition-colors disabled:cursor-not-allowed ${
                isSelected
                  ? "border-gold bg-gold/15 text-fg"
                  : "border-border bg-bg-elevated text-fg hover:border-fg-subtle"
              } ${locked && !isSelected ? "opacity-50" : ""}`}
            >
              <span
                className={`mr-3 font-mono ${isSelected ? "text-gold" : "text-fg-subtle"}`}
              >
                {i + 1}
              </span>
              {option}
            </button>
          );
        })}
      </div>

      {locked && (
        <p className="text-center text-xs text-fg-subtle">
          Se acabó el tiempo. Esperando la resolución…
        </p>
      )}
    </div>
  );
}
