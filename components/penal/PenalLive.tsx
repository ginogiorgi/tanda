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
import { PenalHud, type PenalDot } from "@/components/penal/PenalHud";
import { TimeBar } from "@/components/penal/TimeBar";
import {
  playGood,
  playBad,
  playWhistle,
  setMuted as setAudioMuted,
  unlockAudio,
} from "@/lib/audio";
import { loadPrefs, savePrefs } from "@/lib/prefs";

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
  // 10.12: tablero de penales resueltos del match (verde gol / rojo erró), por lado vía paridad de idx.
  const [dots, setDots] = useState<PenalDot[]>([]);
  const [kicksPerSide, setKicksPerSide] = useState(5);
  const [muted, setMuted] = useState(false);

  // Mute persistente (8.7/8.12): cargar la preferencia al montar. Estado inicial false (evita
  // mismatch de hidratación, localStorage es client-only); el effect lo corrige tras montar.
  useEffect(() => {
    const m = loadPrefs().muted;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMuted(m);
    setAudioMuted(m);
  }, []);

  function toggleMute() {
    setMuted((m) => {
      const next = !m;
      setAudioMuted(next);
      savePrefs({ muted: next });
      return next;
    });
  }
  const [remaining, setRemaining] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  // 10.11: ms restantes congelados en el instante del tap → la barra/contador quedan fijos al
  // responder (el penal igual resuelve a los 10s server). `null` = todavía no respondí esta fase.
  const [frozenRemaining, setFrozenRemaining] = useState<number | null>(null);
  const [confirmingAbandon, setConfirmingAbandon] = useState(false);
  const [abandoning, setAbandoning] = useState(false);
  const [abandonError, setAbandonError] = useState(false);
  const channelRef = useRef<RealtimeChannel | null>(null);
  // Espejo de `scene` para leer mi rol dentro del handler de `penal:result` (closure del subscribe,
  // que se arma una sola vez antes de que `scene` cargue) → audio por perspectiva (10.8).
  const sceneRef = useRef<MatchScene | null>(null);
  const pokedRef = useRef<string | null>(null);
  const vibratedRef = useRef<string | null>(null);
  const remainingRef = useRef(0);
  // 10.11: respuesta NO cambiable. Ref (no estado) para que el guard sobreviva al closure stale
  // del handler de teclado (que solo se re-crea al cambiar de fase, no al elegir).
  const answeredRef = useRef(false);

  useEffect(() => {
    let active = true;

    let subscribedOnce = false;

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

      // Rehidrata el estado del penal en curso desde el server (get_active_match): se usa al montar y
      // tras una reconexión del canal, por si nos perdimos un Broadcast mientras estábamos caídos (9.5).
      const hydrate = async () => {
        const { data } = await supabase.rpc("get_active_match");
        if (!active) return;
        const am = data as ActiveMatch | null;
        if (am && am.match_id === matchId) {
          setScore({ home: am.home_score, away: am.away_score });
          // 10.12: penales por lado según fase del match (grupos 3 / eliminación 5) para "Penal N de M".
          setKicksPerSide(am.phase === "group" ? 3 : 5);
          if (am.penal) {
            setPenal(am.penal);
            // 10.11: si ya había respondido (reconexión), retomo la selección y la dejo fija.
            const mine = am.penal.my_option ?? null;
            setSelected(mine);
            answeredRef.current = mine != null;
          }
        }
      };

      const onNewPhase = ({ payload }: { payload: unknown }) => {
        const next = payload as PenalStartPayload;
        if (next.phase !== "second_chance") playWhistle(); // silbato al abrir el penal (8.7)
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
        // Fase nueva → arranca sin selección y con la respuesta des-bloqueada (10.11).
        setSelected(null);
        setFrozenRemaining(null);
        answeredRef.current = false;
        setResult(null);
      };

      channel
        .on("broadcast", { event: "penal:start" }, onNewPhase)
        .on("broadcast", { event: "penal:second_chance" }, onNewPhase)
        .on("broadcast", { event: "penal:result" }, ({ payload }) => {
          const r = payload as PenalResultPayload;
          setResult(r);
          setScore({ home: r.home_score, away: r.away_score });
          // 10.8: audio por perspectiva → "bueno" si el resultado favorece a MI lado (metí/atajé),
          // "malo" si favorece al rival. No por gol/atajada físico (eso ya lo dice la animación 3D).
          const myId = sceneRef.current?.my_participant_id ?? null;
          const myRole =
            myId === r.kicker_participant_id
              ? "kick"
              : myId === r.keeper_participant_id
                ? "keep"
                : null;
          const good =
            (myRole === "kick" && r.winner === "kicker") ||
            (myRole === "keep" && r.winner === "keeper");
          if (myRole == null ? r.scored : good) playGood();
          else playBad();
          // 10.12: sumá este penal al tablero (dedupe por idx ante re-emisiones).
          setDots((prev) =>
            prev.some((d) => d.idx === r.idx)
              ? prev
              : [...prev, { idx: r.idx, scored: r.scored }].sort((a, b) => a.idx - b.idx),
          );
        })
        .subscribe((status) => {
          // Reconexión (9.5): al volver a SUBSCRIBED tras una caída, resincronizamos por si nos
          // perdimos un Broadcast. supabase-js reaplica el auth del canal privado automáticamente.
          if (status === "SUBSCRIBED") {
            if (subscribedOnce) void hydrate();
            subscribedOnce = true;
          }
        });

      // Datos estáticos de la escena 3D (naciones/kits + avatares de ambos): se piden una vez.
      const { data: sceneData } = await supabase.rpc("get_match_scene", {
        p_match: matchId,
      });
      if (!active) return;
      const sc = (sceneData as MatchScene | null) ?? null;
      setScene(sc);
      sceneRef.current = sc;

      // 10.12: siembra el tablero con los penales ya resueltos del match (para refresh/reconexión).
      const { data: penalsData } = await supabase.rpc("get_match_penals", { p_match: matchId });
      if (!active) return;
      const seeded = (penalsData as { idx: number; scored: boolean }[] | null) ?? [];
      if (seeded.length > 0) {
        setDots((prev) => {
          const have = new Set(prev.map((d) => d.idx));
          const merged = [...prev];
          for (const p of seeded) if (!have.has(p.idx)) merged.push({ idx: p.idx, scored: p.scored });
          return merged.sort((a, b) => a.idx - b.idx);
        });
      }

      // Rehidratación inicial (4.8): retomo el penal en curso con su deadline server y mi selección.
      await hydrate();
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
      remainingRef.current = r;
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

  // 10.11: elegir opción. PRIMER TAP GANA (no cambiable): el server rechaza un cambio con
  // `already_answered`. Optimista en el cliente; al tap congelo el contador (frozenRemaining) y
  // bloqueo. El penal igual resuelve a los 10s server (la rapidez se mide por este `selected_at`).
  async function onSelect(option: number) {
    if (!penal || remainingRef.current <= 0 || answeredRef.current) return;
    answeredRef.current = true;
    unlockAudio(); // primer gesto del usuario → habilita el audio
    setSelected(option); // resaltado optimista
    setFrozenRemaining(remainingRef.current); // congela la barra/segundo en este instante
    const { error } = await supabase.rpc("select_option", {
      p_penalty: penal.penalty_id,
      p_option: option,
    });
    if (error) {
      // p. ej. `out_of_window`: el server manda → revierto y des-bloqueo.
      answeredRef.current = false;
      setSelected(null);
      setFrozenRemaining(null);
    }
  }

  // Teclado en desktop (8.12): 1/2/3 eligen la opción (salvo la quitada en 2ª chance).
  useEffect(() => {
    if (!penal) return;
    const handler = (e: KeyboardEvent) => {
      const i = e.key === "1" ? 0 : e.key === "2" ? 1 : e.key === "3" ? 2 : -1;
      if (i < 0 || penal.removed_option === i) return;
      void onSelect(i);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
    // onSelect/penal estables dentro de la fase; el guard de tiempo usa remainingRef.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [penal]);

  // Abandonar (5.4): el participante pasa a bot con la dificultad de su nación y el usuario vuelve
  // al home; los penales en curso los completa el bot (server-authoritative). Confirma en dos toques.
  async function onAbandon() {
    if (!confirmingAbandon) {
      setConfirmingAbandon(true);
      return;
    }
    setAbandoning(true);
    setAbandonError(false);
    const { error } = await supabase.rpc("abandon", { p_match: matchId });
    if (error) {
      // No navegamos: si abandon falla, el server te sigue tratando como humano (responderías
      // random hasta reconectar). Mejor quedarse en el penal y reintentar que creer que abandonaste.
      setAbandoning(false);
      setConfirmingAbandon(false);
      setAbandonError(true);
      return;
    }
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

  // Mi rol en este penal (pateo/atajo), para el HUD, el audio por perspectiva (10.8) y el motivo
  // del resultado (10.7). `null` si no juego este penal (no debería pasar con datos de escena).
  const myId = scene?.my_participant_id ?? null;
  const role: "kick" | "keep" | null =
    myId == null
      ? null
      : myId === penal.kicker_participant_id
        ? "kick"
        : myId === penal.keeper_participant_id
          ? "keep"
          : null;
  const briefFor = (pid: string | undefined | null) => {
    if (!scene || pid == null) return null;
    if (scene.home?.participant_id === pid) return scene.home;
    if (scene.away?.participant_id === pid) return scene.away;
    return null;
  };

  // Resuelto: animación 3D goal/save/miss_wide (8.4/4.9) + GOL/ATAJADO + revela la correcta (§8.11).
  if (result) {
    const iAnswered = selected != null;
    const amWinner =
      (role === "kick" && result.winner === "kicker") ||
      (role === "keep" && result.winner === "keeper");
    // 10.7: si se decidió por velocidad (ambos acertaron), explicar por qué con el delta de tiempos.
    const winnerId =
      result.winner === "kicker"
        ? result.kicker_participant_id
        : result.keeper_participant_id;
    const winnerNation = briefFor(winnerId)?.nation_name ?? "El rival";
    const deltaMs =
      result.kicker_selected_at && result.keeper_selected_at
        ? Math.abs(
            new Date(result.kicker_selected_at).getTime() -
              new Date(result.keeper_selected_at).getTime(),
          )
        : null;
    return (
      <>
        {sceneBg(true, { reason: result.reason, variant: result.variant })}
        <div className="fade-in relative z-10 mt-auto flex w-full max-w-md flex-col items-center gap-3 pb-4 text-center">
          <span className="text-sm font-medium uppercase tracking-[0.2em] text-fg-subtle">
            Penal {result.idx} · {result.home_score}–{result.away_score}
          </span>
          <p className="text-4xl font-extrabold tracking-tight text-gold">
            {result.scored ? "¡GOL!" : "ATAJADO"}
          </p>
          {/* 10.7: motivo cuando empatan en aciertos y gana el más rápido. */}
          {result.won_by_speed && deltaMs != null && (
            <p className="text-sm font-semibold text-fg-muted">
              {amWinner
                ? `Ganaste por velocidad: respondiste ${(deltaMs / 1000).toFixed(1)}s antes`
                : `${winnerNation} respondió ${(deltaMs / 1000).toFixed(1)}s más rápido`}
            </p>
          )}
          <p className="text-balance text-sm text-fg-muted">{penal.prompt}</p>
          {/* 10.6 (visible): tu pick vs la correcta; si no respondiste, opción al azar. */}
          {role != null &&
            (iAnswered ? (
              <p className="text-sm text-fg-subtle">
                Tu respuesta: {penal.options[selected]}
              </p>
            ) : (
              <p className="text-sm text-amber-400">
                No respondiste → se eligió una opción al azar
              </p>
            ))}
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

  const isSecondChance = penal.phase === "second_chance";
  const answered = selected != null;
  const locked = remaining <= 0;
  const totalMs = Math.max(
    1,
    new Date(penal.deadline).getTime() - new Date(penal.started_at).getTime(),
  );
  // 10.11: al responder, el contador/barra se congelan en el instante del tap (frozenRemaining).
  const displayRemaining = frozenRemaining ?? remaining;
  const seconds = Math.ceil(displayRemaining / 1000);
  const answeredAtSec =
    frozenRemaining != null ? (totalMs - frozenRemaining) / 1000 : null;

  return (
    <>
      {sceneBg(false)}
      <div className="fade-in relative z-10 flex w-full max-w-md flex-col gap-6">
      <PenalHud
        home={scene?.home ?? null}
        away={scene?.away ?? null}
        homeScore={score.home}
        awayScore={score.away}
        idx={penal.idx}
        role={role}
        dots={dots}
        kicksPerSide={kicksPerSide}
      />
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium uppercase tracking-[0.2em] text-fg-subtle">
          {isSecondChance ? "2ª chance" : "Elegí tu respuesta"}
        </span>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={toggleMute}
            aria-label={muted ? "Activar sonido" : "Silenciar"}
            className="text-fg-subtle transition-colors hover:text-fg-muted"
          >
            {muted ? "🔇" : "🔊"}
          </button>
          <span className="font-mono text-2xl font-bold tabular-nums text-gold">{seconds}</span>
        </div>
      </div>
      <TimeBar fraction={displayRemaining / totalMs} />

      {/* 10.13: explicar por qué reaparecen las opciones en segunda chance. */}
      {isSecondChance && (
        <p className="text-center text-sm font-medium text-amber-400">
          Erraron los dos: segunda chance — quedan 2 opciones
        </p>
      )}

      {/* 10.11: confirmación de que tu respuesta quedó fija + el segundo exacto. */}
      {answered && !locked && answeredAtSec != null && (
        <p className="text-center text-xs text-fg-subtle">
          Respondiste a los {answeredAtSec.toFixed(1)}s · esperando el resto
        </p>
      )}

      <p className="text-balance text-center text-xl font-semibold text-fg">
        {penal.prompt}
      </p>

      <div className="flex flex-col gap-3">
        {penal.options.map((option, i) => {
          const isRemoved = penal.removed_option === i;
          if (isRemoved) return null; // en 2ª chance, la opción quitada no se muestra
          const isSelected = selected === i;
          // 10.11: una vez que respondiste, los botones quedan bloqueados (no cambiable).
          const disabled = locked || answered;
          return (
            <button
              key={i}
              type="button"
              onClick={() => onSelect(i)}
              disabled={disabled}
              aria-pressed={isSelected}
              className={`flex items-center rounded-xl border px-4 py-3 text-left font-medium transition-colors disabled:cursor-not-allowed ${
                isSelected
                  ? "border-gold bg-gold/15 text-fg"
                  : "border-border bg-bg-elevated text-fg hover:border-fg-subtle"
              } ${disabled && !isSelected ? "opacity-50" : ""}`}
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
      {abandonError && (
        <p className="text-center text-xs text-danger">
          No se pudo abandonar. Probá de nuevo.
        </p>
      )}
      </div>
    </>
  );
}
