"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import {
  clockOffset,
  remainingMs,
  type PenalStartPayload,
  type PenalResultPayload,
  type ActiveMatch,
  type MatchScene,
} from "@/lib/realtime/penal";
import { resolveSceneRoles } from "@/lib/penal/scene";
import { PenalSceneViewer } from "@/components/penal/PenalSceneViewer";
import type { PenalAnimation } from "@/components/penal/PenalScene";
import { PenalHud } from "@/components/penal/PenalHud";
import { TimeBar } from "@/components/penal/TimeBar";

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
  const router = useRouter();
  const [supabase] = useState(() => createClient());
  const [penal, setPenal] = useState<PenalStartPayload | null>(null);
  const [scene, setScene] = useState<MatchScene | null>(null);
  const [result, setResult] = useState<PenalResultPayload | null>(null);
  const [score, setScore] = useState<{ home: number; away: number }>({ home: 0, away: 0 });
  const [remaining, setRemaining] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [confirmingAbandon, setConfirmingAbandon] = useState(false);
  const [abandoning, setAbandoning] = useState(false);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const pokedRef = useRef<string | null>(null);
  const vibratedRef = useRef<string | null>(null);

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
        const next = payload as PenalStartPayload;
        // `penal:second_chance` no trae pateador/arquero (mismo penalty_id que el `penal:start`
        // previo): los arrastramos del penal en curso para no perder la colocación de avatares.
        setPenal((prev) =>
          !next.kicker_participant_id && prev?.penalty_id === next.penalty_id
            ? {
                ...next,
                kicker_participant_id: prev.kicker_participant_id,
                keeper_participant_id: prev.keeper_participant_id,
              }
            : next,
        );
        setSelected(null); // fase nueva → arranca sin selección
        setResult(null);
      };

      channel
        .on("broadcast", { event: "penal:start" }, onNewPhase)
        .on("broadcast", { event: "penal:second_chance" }, onNewPhase)
        .on("broadcast", { event: "penal:result" }, ({ payload }) => {
          const r = payload as PenalResultPayload;
          setResult(r);
          setScore({ home: r.home_score, away: r.away_score });
        })
        .subscribe();

      // Datos estáticos de la escena 3D (naciones/kits + avatares de ambos): se piden una vez.
      const { data: sceneData } = await supabase.rpc("get_match_scene", {
        p_match: matchId,
      });
      if (!active) return;
      setScene((sceneData as MatchScene | null) ?? null);

      // Rehidratación (4.8): tras refresh/reconexión, retomo el penal en curso con su deadline
      // server y mi selección, sin esperar al próximo Broadcast (SPEC §5.2).
      const { data } = await supabase.rpc("get_active_match");
      if (!active) return;
      const am = data as ActiveMatch | null;
      if (am && am.match_id === matchId) {
        setScore({ home: am.home_score, away: am.away_score });
        if (am.penal) {
          setPenal(am.penal);
          setSelected(am.penal.my_option ?? null);
        }
      }
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
      // Vibración una vez al entrar en los últimos 3s (8.3), si el dispositivo lo soporta.
      if (r > 0 && r <= 3000 && vibratedRef.current !== phaseKey) {
        vibratedRef.current = phaseKey;
        if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
          navigator.vibrate(180);
        }
      }
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

  // Abandonar (5.4): el participante pasa a bot con la dificultad de su nación y el usuario vuelve
  // al home; los penales en curso los completa el bot (server-authoritative). Confirma en dos toques.
  async function onAbandon() {
    if (!confirmingAbandon) {
      setConfirmingAbandon(true);
      return;
    }
    setAbandoning(true);
    await supabase.rpc("abandon", { p_match: matchId });
    router.push("/");
  }

  if (!penal) {
    return <p className="text-sm text-fg-subtle">Esperando el penal…</p>;
  }

  // Escena 3D detrás de la tarjeta: cancha/arco/pelota + avatares pateador/arquero (§8.2). Durante
  // el penal va atenuada/desenfocada; al resolver se juega la animación según el `reason` (8.4/4.9)
  // con la escena casi sin atenuar. `null` si el partido no tiene datos de escena (p. ej. dev harness
  // sin nación) → degrada a solo la tarjeta.
  const sceneRoles = resolveSceneRoles(penal, scene);
  const sceneBg = (soft: boolean, anim: PenalAnimation | null = null) =>
    sceneRoles ? (
      <div className="fixed inset-0 z-0">
        <PenalSceneViewer
          kicker={sceneRoles.kicker}
          keeper={sceneRoles.keeper}
          result={anim}
          className="h-full w-full"
        />
        <div
          className={`absolute inset-0 ${soft ? "bg-bg/15" : "bg-bg/60 backdrop-blur-sm"}`}
        />
      </div>
    ) : null;

  // Resuelto: animación 3D goal/save/miss_wide (8.4/4.9) + GOL/ATAJADO + revela la correcta (§8.11).
  if (result) {
    return (
      <>
        {sceneBg(true, { reason: result.reason, variant: result.variant })}
        <div className="relative z-10 mt-auto flex w-full max-w-md flex-col items-center gap-3 pb-4 text-center">
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
      </>
    );
  }

  const seconds = Math.ceil(remaining / 1000);
  const locked = remaining <= 0;
  const isSecondChance = penal.phase === "second_chance";
  const totalMs = Math.max(
    1,
    new Date(penal.deadline).getTime() - new Date(penal.started_at).getTime(),
  );
  const myId = scene?.my_participant_id ?? null;
  const role: "kick" | "keep" | null =
    myId == null
      ? null
      : myId === penal.kicker_participant_id
        ? "kick"
        : myId === penal.keeper_participant_id
          ? "keep"
          : null;

  return (
    <>
      {sceneBg(false)}
      <div className="relative z-10 flex w-full max-w-md flex-col gap-6">
      <PenalHud
        home={scene?.home ?? null}
        away={scene?.away ?? null}
        homeScore={score.home}
        awayScore={score.away}
        idx={penal.idx}
        role={role}
      />
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium uppercase tracking-[0.2em] text-fg-subtle">
          {isSecondChance ? "2ª chance" : "Elegí tu respuesta"}
        </span>
        <span className="font-mono text-2xl font-bold tabular-nums text-gold">
          {seconds}
        </span>
      </div>
      <TimeBar fraction={remaining / totalMs} />

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

      <button
        type="button"
        onClick={onAbandon}
        onBlur={() => setConfirmingAbandon(false)}
        disabled={abandoning}
        className={`mx-auto mt-2 text-xs font-medium transition-colors disabled:opacity-50 ${
          confirmingAbandon ? "text-red-400" : "text-fg-subtle hover:text-fg-muted"
        }`}
      >
        {abandoning
          ? "Abandonando…"
          : confirmingAbandon
            ? "¿Seguro? Tocá de nuevo para abandonar"
            : "Abandonar"}
      </button>
      </div>
    </>
  );
}
