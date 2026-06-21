"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  // Tarea 5: espejo del resultado + timeout de respaldo. Si se pierde el broadcast `penal:result`
  // (reconexión), buscamos el resultado por RPC para no quedar colgados en la animación.
  const resultRef = useRef<PenalResultPayload | null>(null);
  const fallbackRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    resultRef.current = result;
  }, [result]);

  // B3.1: identidad ESTABLE del objeto de animación (keyada por penal+reason+variant). Sin esto, el
  // literal inline se recreaba en cada render (el contador tickea 250ms mientras se ve el resultado),
  // reiniciando la animación 3D una y otra vez. Memoizado → la escena la corre una sola vez.
  const anim = useMemo<PenalAnimation | null>(
    () =>
      result
        ? { id: result.penalty_id, reason: result.reason, variant: result.variant }
        : null,
    [result],
  );

  // Aplica un resultado de penal (de broadcast o del fallback por RPC): marcador, audio por
  // perspectiva (10.8) y tablero de penales (10.12). Idempotente por `penalty_id`.
  const applyResult = useCallback((r: PenalResultPayload) => {
    if (resultRef.current?.penalty_id === r.penalty_id) return;
    setResult(r);
    setScore({ home: r.home_score, away: r.away_score });
    const myId = sceneRef.current?.my_participant_id ?? null;
    const myRole =
      myId === r.kicker_participant_id ? "kick" : myId === r.keeper_participant_id ? "keep" : null;
    const good =
      (myRole === "kick" && r.winner === "kicker") ||
      (myRole === "keep" && r.winner === "keeper");
    if (myRole == null ? r.scored : good) playGood();
    else playBad();
    setDots((prev) =>
      prev.some((d) => d.idx === r.idx)
        ? prev
        : [...prev, { idx: r.idx, scored: r.scored }].sort((a, b) => a.idx - b.idx),
    );
  }, []);

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
        setPenal((prev) => {
          const kickerId = next.kicker_participant_id ?? prev?.kicker_participant_id;
          const keeperId = next.keeper_participant_id ?? prev?.keeper_participant_id;
          // Tarea 10: el broadcast de 2ª chance trae la opción quitada de cada lado; normalizamos a la
          // del rol propio (la que YO elegí) para el resto del componente.
          const myId = sceneRef.current?.my_participant_id ?? null;
          const myRemoved =
            myId != null && myId === kickerId
              ? next.removed_option_kicker
              : myId != null && myId === keeperId
                ? next.removed_option_keeper
                : next.removed_option;
          const merged =
            !next.kicker_participant_id && prev?.penalty_id === next.penalty_id
              ? { ...next, kicker_participant_id: kickerId, keeper_participant_id: keeperId }
              : next;
          return { ...merged, removed_option: myRemoved };
        });
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
          // 10.8/10.12: marcador + audio por perspectiva + tablero (idempotente por penalty_id).
          applyResult(payload as PenalResultPayload);
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
  }, [supabase, matchId, applyResult]);

  // Contador contra el `deadline` server, corregido por el offset estimado al recibir la fase
  // (SPEC §1.3). Al llegar a 0, el cliente hace el "poke": llama `resolve_penalty` una sola vez
  // por fase. El server valida `now() >= deadline` y es idempotente (no se puede adelantar).
  useEffect(() => {
    if (!penal) return;
    const offset = clockOffset(penal.server_now);
    const phaseKey = `${penal.penalty_id}:${penal.started_at}`;

    // Poke al deadline: resuelve el penal (idempotente en el server, valida now()≥deadline). Una sola
    // vez por fase. Transición optimista: congelamos el contador en 0 → la UI se bloquea y pasa al
    // estado de espera de la animación sin parpadeo.
    const poke = () => {
      if (pokedRef.current === phaseKey) return;
      pokedRef.current = phaseKey;
      setRemaining(0);
      remainingRef.current = 0;
      void supabase.rpc("resolve_penalty", { p_penalty: penal.penalty_id });
      // Tarea 5: respaldo si se pierde el broadcast `penal:result` (reconexión) → buscamos el
      // resultado por RPC y lo aplicamos igual, así no quedamos colgados en la animación. Reintenta
      // mientras el server todavía está resolviendo (devuelve null hasta que el penal está `resolved`).
      const penaltyId = penal.penalty_id;
      let tries = 0;
      const pull = async () => {
        if (resultRef.current || tries >= 5) return;
        tries++;
        const { data } = await supabase.rpc("get_penalty_result", { p_penalty: penaltyId });
        if (resultRef.current) return;
        if (data) applyResult(data);
        else fallbackRef.current = setTimeout(() => void pull(), 600);
      };
      if (fallbackRef.current) clearTimeout(fallbackRef.current);
      fallbackRef.current = setTimeout(() => void pull(), 600);
    };

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
      if (r <= 0) poke();
    };
    tick();
    const id = setInterval(tick, 250);
    // B4.1: poke EXACTO al deadline en vez de esperar al próximo tick de 250ms → se entra a la
    // animación al instante (clave en la 2ª chance de 5s, donde 250ms de demora se notan). Si el
    // deadline ya pasó, el `tick()` de arriba ya disparó el poke (idempotente).
    const exactId = setTimeout(poke, Math.max(0, remainingMs(penal.deadline, offset)));
    return () => {
      clearInterval(id);
      clearTimeout(exactId);
      if (fallbackRef.current) clearTimeout(fallbackRef.current);
    };
  }, [penal, supabase, applyResult]);

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
        {sceneBg(true, anim)}
        {/* Tarea 4: el texto va arriba (encima del arco) sobre una placa sutil con blur → no se confunde
            con el arco claro del fondo. */}
        {/* T7: en mobile el globo se sube (sin padding superior y un toque de margen negativo) para
            no tapar el arco; en desktop conserva el aire de arriba. */}
        <div className="fade-in relative z-10 mb-auto flex w-full max-w-md flex-col items-center -mt-2 pt-0 text-center sm:mt-0 sm:pt-4">
          <div className="flex w-full flex-col items-center gap-3 rounded-2xl bg-bg/75 px-5 py-5 ring-1 ring-border/60 backdrop-blur-sm">
            <span className="text-sm font-medium uppercase tracking-[0.2em] text-fg-muted">
              Penal {result.idx} · {result.home_score}–{result.away_score}
            </span>
            <p className="text-4xl font-extrabold tracking-tight text-gold drop-shadow-sm">
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
            {/* T4: globo simple — solo la correcta, en verde si el jugador acertó, rojo si erró
                (o no respondió). Sin repetir la pregunta ni "Tu respuesta". */}
            <p
              className={`text-base font-semibold ${
                selected === result.correct_index ? "text-success" : "text-danger"
              }`}
            >
              Correcta: {penal.options[result.correct_index]}
            </p>
          </div>
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
      {/* T3: la tarjeta del penal activo va ARRIBA (justo encima del arco), no centrada, para no tapar
          la escena 3D. Mismo anclaje que el cartel de resultado: mb-auto + margen superior chico. */}
      <div
        className={`fade-in relative z-10 mb-auto flex w-full max-w-md flex-col gap-6 -mt-2 pt-0 sm:mt-0 sm:pt-4 ${
          isSecondChance ? "rounded-2xl ring-1 ring-amber-400/40" : ""
        }`}
      >
      <PenalHud
        home={scene?.home ?? null}
        away={scene?.away ?? null}
        homeScore={score.home}
        awayScore={score.away}
        idx={penal.idx}
        role={role}
        dots={dots}
        kicksPerSide={kicksPerSide}
        flip={myId != null && myId === scene?.away?.participant_id}
      />
      <div className="flex items-center justify-between text-sm">
        <span
          className={`font-medium uppercase tracking-[0.2em] ${
            isSecondChance ? "font-bold text-amber-300" : "text-fg-subtle"
          }`}
        >
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

      {/* 10.13: banner prominente — que se note que entraste en otra fase del penal. */}
      {isSecondChance && (
        <div className="fade-in rounded-xl border border-amber-400/60 bg-amber-500/15 px-4 py-3 text-center">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-300">
            Segunda chance
          </p>
          <p className="mt-1 text-sm font-medium text-amber-100">
            Erraron los dos — quedan 2 opciones. ¡Última oportunidad!
          </p>
        </div>
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
