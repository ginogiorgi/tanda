"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNav } from "@/lib/nav/useNav";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { fire } from "@/lib/supabase/fire";
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
import { PenaltyResultBalloon } from "@/components/penal/PenaltyResultBalloon";
import {
  playGood,
  playBad,
  playWhistle,
  setMuted as setAudioMuted,
  unlockAudio,
} from "@/lib/audio";
import { loadPrefs, savePrefs } from "@/lib/prefs";
import { GameStage } from "@/components/ui/GameStage";
import { REVEAL_MS } from "@/lib/engine/timing";
import { BALL_T1 } from "@/lib/penal/shot";

type PenalLiveProps = {
  matchId: string;
  /** Ranked: abandonar es derrota inmediata (y cuesta puntos) → se avisa en la confirmación. */
  ranked?: boolean;
  /**
   * Llega un resultado (instante local, ms). El padre ancla ahí cuánto deja ver el último cartel del
   * partido antes de ceder la pantalla (`MATCH_RESULT_LINGER_MS`, feedback 3 #12).
   */
  /** Ancla del último cartel: al llegar el resultado y otra vez al revelarlo (`Date.now() - REVEAL_MS`, por si el timer se atrasó). */
  onResult?: (receivedAt: number) => void;
};

/**
 * Suscripción al canal privado `match:{id}` y render del penal en vivo. Es la base de la
 * pantalla de penal (F8 escena 3D + tarjeta premium). Maneja el ciclo completo:
 * `penal:start` (pregunta sin la correcta) → `select_option` (primer tap fijo) → poke a 0s
 * (`resolve_penalty`, SPEC §1.3) → `penal:second_chance` (2 opciones, 5s) o `penal:result`.
 * Revelado (feedback 3 #2): al llegar el resultado se juega la jugada SIN cartel; el sonido va cuando
 * la pelota llega (`BALL_T1`) y el cartel (GOL/ATAJADO + la correcta) recién a `REVEAL_MS`, cuando la
 * pelota quedó quieta; se queda hasta el próximo penal (`resultCardS` del server).
 *
 * Canal **privado**: requiere `realtime.setAuth(token)` antes de suscribir; la lectura la
 * gobierna la policy `match_broadcast_select` en `realtime.messages` (solo participantes).
 */
/**
 * El penal vive en un `GameStage` (feedback 2, P4): escena, globo y tarjeta van `absolute` adentro, no
 * `fixed` al viewport → mientras jugás se ven fijos y el footer queda debajo, en el flujo.
 */
export function PenalLive(props: PenalLiveProps) {
  return (
    <GameStage>
      <PenalView {...props} />
    </GameStage>
  );
}

function PenalView({ matchId, ranked = false, onResult }: PenalLiveProps) {
  const router = useNav();
  const [supabase] = useState(() => createClient());
  const [penal, setPenal] = useState<PenalStartPayload | null>(null);
  const [scene, setScene] = useState<MatchScene | null>(null);
  const [result, setResult] = useState<PenalResultPayload | null>(null);
  // Penal cuyo cartel ya se reveló (la jugada terminó). Hasta entonces, solo la escena.
  const [revealedId, setRevealedId] = useState<string | null>(null);
  const revealTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const onResultRef = useRef(onResult);
  useEffect(() => {
    onResultRef.current = onResult;
  }, [onResult]);
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
    resultRef.current = r;
    onResultRef.current?.(Date.now());
    setResult(r);
    setScore({ home: r.home_score, away: r.away_score });
    const myId = sceneRef.current?.my_participant_id ?? null;
    const myRole =
      myId === r.kicker_participant_id ? "kick" : myId === r.keeper_participant_id ? "keep" : null;
    const good =
      (myRole === "kick" && r.winner === "kicker") ||
      (myRole === "keep" && r.winner === "keeper");
    for (const t of revealTimers.current) clearTimeout(t);
    revealTimers.current = [
      // El sonido cuando la pelota llega (no al recibir el resultado: delataría la jugada).
      setTimeout(() => ((myRole == null ? r.scored : good) ? playGood() : playBad()), BALL_T1 * 1000),
      setTimeout(() => {
        setRevealedId(r.penalty_id);
        // Si el timer se atrasó (hilo ocupado), el cartel igual dura entero: el ancla del linger se corre.
        onResultRef.current?.(Date.now() - REVEAL_MS);
      }, REVEAL_MS),
    ];
    setDots((prev) =>
      prev.some((d) => d.idx === r.idx)
        ? prev
        : [...prev, { idx: r.idx, scored: r.scored }].sort((a, b) => a.idx - b.idx),
    );
  }, []);

  useEffect(
    () => () => {
      for (const t of revealTimers.current) clearTimeout(t);
    },
    [],
  );

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
            // Punto 20: si el server ya va por OTRO penal, el resultado viejo no puede seguir tapando la
            // pantalla (el render mira `result` antes que `penal`) → se descarta y se arranca la fase nueva.
            if (resultRef.current && resultRef.current.penalty_id !== am.penal.penalty_id) {
              resultRef.current = null;
              setResult(null);
              setFrozenRemaining(null);
            }
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
  // por fase (idempotente). Regla de fase: si los dos ya respondieron, el server resuelve ANTES y el
  // `penal:result` llega con el contador corriendo → el contador se frena (sin vibrar ni pokear).
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
      fire(supabase.rpc("resolve_penalty", { p_penalty: penal.penalty_id }));
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
      if (resultRef.current?.penalty_id === penal.penalty_id) return; // ya resuelto
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
  // bloqueo. El penal resuelve a los 10s aunque hayan respondido los dos (server; la rapidez se mide
  // por este `selected_at`).
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
    return <p className="grid h-full place-items-center text-sm text-fg-subtle">Esperando el penal…</p>;
  }

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

  // Fase visual. Feedback 4 #12/#14: las fases NO devuelven árboles distintos (fragment ↔ div) — eso
  // remontaba el Canvas (pantallazo + la jugada arrancaba de nuevo al aparecer el cartel). La escena vive
  // siempre en la misma posición (primer hijo) y lo que cambia por fase es el overlay hermano.
  //  - question: tarjeta de la pregunta, escena atenuada.
  //  - playing: resuelto, jugada en curso: solo la escena (nada que delate el resultado hasta que la
  //    pelota se quede quieta). Reduced motion: la escena ya muestra el cuadro final.
  //  - result: GOL/ATAJADO + la correcta (§8.11), hasta que abra el próximo penal.
  const phase: "question" | "playing" | "result" = !result
    ? "question"
    : revealedId !== result.penalty_id
      ? "playing"
      : "result";
  const sceneRoles = resolveSceneRoles(penal, scene);
  const sceneLayer = sceneRoles ? (
    <div className="absolute inset-0 z-0">
      <PenalSceneViewer kicker={sceneRoles.kicker} keeper={sceneRoles.keeper} result={anim} className="h-full w-full" />
      <div
        className={`pointer-events-none absolute inset-0 transition-colors duration-300 ${
          phase === "question" ? "bg-bg/45" : "bg-bg/10"
        }`}
      />
    </div>
  ) : null;
  const muteBalloon = <MuteBalloon muted={muted} onToggle={toggleMute} />;

  if (phase === "playing") {
    return (
      <>
        {sceneLayer}
        <span data-testid="penal-playing" hidden />
        {muteBalloon}
      </>
    );
  }

  // Resuelto y revelado: GOL/ATAJADO + la correcta (§8.11), hasta que abra el próximo penal.
  if (result) {
    const amWinner =
      (role === "kick" && result.winner === "kicker") ||
      (role === "keep" && result.winner === "keeper");
    // 10.7: si se decidió por velocidad (ambos acertaron), explicar por qué con el delta de tiempos.
    const winnerId =
      result.winner === "kicker"
        ? result.kicker_participant_id
        : result.keeper_participant_id;
    const winnerNation = briefFor(winnerId)?.team_name ?? "El rival";
    const deltaMs =
      result.kicker_selected_at && result.keeper_selected_at
        ? Math.abs(
            new Date(result.kicker_selected_at).getTime() -
              new Date(result.keeper_selected_at).getTime(),
          )
        : null;
    return (
      <>
        {sceneLayer}
        {/* El globo de resultado va ANCLADO ARRIBA del stage (encima del arco), no centrado: si no, tapaba la
            pateada. Es papel translúcido (feedback 4 #11): el arco y el arquero se ven a través. */}
        <PenaltyResultBalloon
          idx={result.idx}
          homeScore={result.home_score}
          awayScore={result.away_score}
          scored={result.scored}
          note={
            result.won_by_speed && deltaMs != null
              ? amWinner
                ? `Ganaste por velocidad: respondiste ${(deltaMs / 1000).toFixed(1)}s antes`
                : `${winnerNation} respondió ${(deltaMs / 1000).toFixed(1)}s más rápido`
              : null
          }
          correctText={penal.options[result.correct_index] ?? ""}
          answeredRight={selected === result.correct_index}
        />
        {muteBalloon}
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
      {sceneLayer}
      {/* La tarjeta del penal activo va ANCLADA ARRIBA del stage (encima del arco), mismo criterio que
          el globo. El ancla ocupa el alto del stage (para que `max-h-full` tenga referencia) pero no
          recibe toques: solo la tarjeta. Si no entra (360×640), scrollea SOLO la tarjeta. */}
      <div
        className="fade-in pointer-events-none absolute inset-x-0 bottom-[4%] top-16 md:top-[4%] z-10 mx-auto flex w-full max-w-md flex-col px-4"
      >
      {/* Hoja del programa: papel con borde de tinta sobre la escena (se lee siempre, sin blur). */}
      <div
        data-layer="card"
        className={`pointer-events-auto flex max-h-full flex-col gap-5 overflow-y-auto rounded-[6px] border-2 bg-bg-elevated p-4 shadow-pop ${
          isSecondChance ? "border-accent-orange" : "border-ink"
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
      {/* Feedback 4 #13: sin "Penal Nº N · Elegí" (el HUD ya dice qué penal es); queda el aviso de 2ª chance.
          Feedback 4 #15: el sonido es un globo arriba a la derecha (MuteBalloon), no va en esta fila. */}
      <div className="flex items-center justify-between">
        {isSecondChance && (
          <span className="text-xs font-bold uppercase tracking-[0.18em] text-accent-orange">2ª chance</span>
        )}
        <span className="ml-auto font-display text-4xl font-black leading-none tabular-nums text-fg">{seconds}</span>
      </div>
      <TimeBar fraction={displayRemaining / totalMs} />

      {/* 10.13: banner prominente — que se note que entraste en otra fase del penal. */}
      {isSecondChance && (
        <div className="fade-in rounded-[4px] border-2 border-ink bg-accent-orange px-4 py-3 text-center text-on-fill">
          <p className="font-display text-2xl font-black uppercase leading-none">
            Segunda chance
          </p>
          <p className="mt-1 text-sm font-medium">
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

      <p className="text-balance text-xl font-semibold leading-snug text-fg">
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
              data-option={i}
              className={`flex items-center rounded-[4px] border-2 border-ink px-4 py-3 text-left font-semibold transition-[background-color,color,transform,box-shadow] duration-100 disabled:cursor-not-allowed ${
                isSelected
                  ? "translate-x-[2px] translate-y-[2px] bg-ink text-bg shadow-press"
                  : "bg-bg-raised text-fg shadow-card hover:bg-bg-overlay"
              } ${disabled && !isSelected ? "opacity-45" : ""}`}
            >
              <span
                className={`mr-3 w-4 font-display text-xl font-black ${isSelected ? "text-bg" : "text-brand"}`}
              >
                {String.fromCharCode(65 + i)}
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
          confirmingAbandon ? "font-bold text-brand-ink" : "text-fg-subtle underline-offset-2 hover:text-fg hover:underline"
        }`}
      >
        {abandoning
          ? "Abandonando…"
          : confirmingAbandon
            ? ranked
              ? "Abandonar = derrota. Tocá de nuevo para confirmar"
              : "¿Seguro? Tocá de nuevo para abandonar"
            : "Abandonar"}
      </button>
      {abandonError && (
        <p className="text-center text-xs font-semibold text-brand-ink">
          No se pudo abandonar. Probá de nuevo.
        </p>
      )}
      </div>
      </div>
      {muteBalloon}
    </>
  );
}

/**
 * Globo de sonido (feedback 4 #15): redondo, arriba a la derecha del stage, en todas las fases del
 * partido. `absolute` dentro del `GameStage` (nada `fixed`).
 */
function MuteBalloon({ muted, onToggle }: { muted: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={muted ? "Activar sonido" : "Silenciar"}
      aria-pressed={muted}
      data-testid="mute-balloon"
      className="absolute right-3 top-3 z-20 grid size-11 place-items-center rounded-full border-2 border-ink bg-bg-elevated text-fg shadow-card transition-colors hover:bg-bg-overlay focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue motion-safe:active:translate-x-[2px] motion-safe:active:translate-y-[2px] active:shadow-press"
    >
      <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor" />
        {muted ? (
          <path d="M16 9.5l5 5M21 9.5l-5 5" />
        ) : (
          <path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11" />
        )}
      </svg>
    </button>
  );
}
