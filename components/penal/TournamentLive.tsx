"use client";

/**
 * Pantalla de torneo (tournament-scoped, 8.5). Te sigue de la fase de grupos a la final: muestra la
 * tarjeta de penal + escena 3D (`<PenalLive>`) cuando hay un penal abierto para vos, y el bracket en
 * vivo + el VS de tu próximo partido en el TIEMPO MUERTO entre rondas (decisión de Gino). La
 * transición la gobierna el server (reloj de ronda), no un timer: cuando se abre el próximo penal
 * `get_active_match` lo refleja y volvemos a la tarjeta.
 *
 * Datos: `get_bracket` (foto inicial, refrescada) + canal privado `tournament:{id}` (`score:live`,
 * 6.5) mergeado con `applyScoreUpdate`. El penal lo resuelve `<PenalLive>` por su canal `match:{id}`.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { fire } from "@/lib/supabase/fire";
import { PenalLive } from "@/components/penal/PenalLive";
import { RunSummary } from "@/components/penal/RunSummary";
import { Button } from "@/components/ui/Button";
import { TeamReveal } from "@/components/penal/TeamReveal";
import { Bracket } from "@/components/bracket/Bracket";
import { LATE_RESULT_GRACE_MS, lingerWaitMs } from "@/lib/engine/timing";
import { buildBracketView, type BracketSnapshot } from "@/lib/bracket/bracket";
import {
  applyScoreUpdate,
  type ScoreboardState,
  type ScoreLivePayload,
} from "@/lib/realtime/score";
import {
  clockOffset,
  remainingMs,
  type ActiveMatch,
  type RoundNextPayload,
} from "@/lib/realtime/penal";
import { usePreload3D } from "@/components/penal/usePreload3D";
import { Page } from "@/components/ui/Page";
import { Confetti } from "@/components/penal/Confetti";
import { getMode, phaseInText } from "@/lib/modes";
import {
  CHAMPION_MS,
  CROSSINGS_MIN_MS,
  REVEAL_MS,
  isOut,
  nextRoundReady,
  tournamentView,
} from "@/lib/tournament/flow";


export function TournamentLive({
  tournamentId,
  isGuest,
}: {
  tournamentId: string;
  isGuest: boolean;
}) {
  usePreload3D(); // el primer penal no paga la descarga del 3D (F4)
  const [supabase] = useState(() => createClient());
  const [snapshot, setSnapshot] = useState<BracketSnapshot | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [live, setLive] = useState<ScoreboardState>({});
  const [currentMatchId, setCurrentMatchId] = useState<string | null>(null);
  const [showPenal, setShowPenal] = useState(false);
  const [revealExpired, setRevealExpired] = useState(false);
  // B5.2: ¿ya jugué al menos un penal en este torneo? Distingue "espera entre rondas" (mi tanda
  // resolvió, faltan otros) de la presentación inicial (todavía nadie pateó → no es espera).
  const [everPlayed, setEverPlayed] = useState(false);
  // P5: relojes de la máquina de estados (lib/tournament/flow) — cruces mínimos tras quedar afuera,
  // pantalla de campeón, y "Ver cómo sigue" (espectador).
  const [crossingsElapsed, setCrossingsElapsed] = useState(false);
  const [championElapsed, setChampionElapsed] = useState(false);
  const [spectating, setSpectating] = useState(false);
  const lingerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Feedback 3 #12: el último cartel del partido se ve completo (jugada + 2,5 s) contando desde que LLEGÓ
  // su resultado, no desde que el poll notó el fin del partido.
  const lastResultAtRef = useRef(0);
  const onResult = useCallback((at: number) => {
    lastResultAtRef.current = Math.max(lastResultAtRef.current, at);
  }, []);
  const showPenalRef = useRef(false);
  const hasSnapshotRef = useRef(false);
  const revealTimerRef = useRef(false);
  // Poke PRECISO de la próxima ronda (agendado por el broadcast `round:next`) + puente al `poll()` de
  // get_active_match para detectar el match nuevo sin esperar el intervalo de 1500ms.
  const nextPokeRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollRef = useRef<(() => void) | null>(null);
  // Refetch puntual del bracket (T11): tras el poke de `round:next` el server pudo flipear de fase
  // (grupos→round_of_32). Forzamos la recarga del snapshot para que el reveal del árbol se vea en el
  // lead-in de 2s en vez de esperar el refresco periódico de 5s.
  const bracketLoadRef = useRef<(() => void) | null>(null);

  // B2.1: arrancar la ventana de presentación AL ENTRAR a /partido (no en start_tournament). Idempotente
  // en el server (1ª llamada de un humano comprime el backstop a ~6s; las siguientes son no-op).
  useEffect(() => {
    fire(supabase.rpc("begin_presentation", { p_tournament: tournamentId }));
  }, [supabase, tournamentId]);

  // Canal privado del torneo: marcadores en vivo (score:live, 6.5).
  useEffect(() => {
    let active = true;
    let channel: RealtimeChannel | null = null;
    void (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!active) return;
      if (session?.access_token) await supabase.realtime.setAuth(session.access_token);
      channel = supabase.channel(`tournament:${tournamentId}`, {
        config: { private: true },
      });
      channel
        .on("broadcast", { event: "score:live" }, ({ payload }) => {
          setLive((s) => applyScoreUpdate(s, payload as ScoreLivePayload));
        })
        // `round:next` (F): el server avisa cuándo vence el tiempo muerto → pokeamos open_next_round
        // EXACTO en ese instante (no esperamos el poll de 1500ms) y re-chequeamos el match activo
        // poco después para mostrar la próxima escena sin jitter.
        .on("broadcast", { event: "round:next" }, ({ payload }) => {
          const p = payload as RoundNextPayload;
          const delay = remainingMs(p.open_at, clockOffset(p.server_now));
          if (nextPokeRef.current) clearTimeout(nextPokeRef.current);
          nextPokeRef.current = setTimeout(() => {
            fire(supabase.rpc("open_next_round", { p_tournament: tournamentId }));
            setTimeout(() => {
              pollRef.current?.();
              bracketLoadRef.current?.(); // reflejar el flip de fase (grupos→KO) sin esperar 5s
            }, 200);
          }, delay);
        })
        .subscribe();
    })();
    return () => {
      active = false;
      if (nextPokeRef.current) clearTimeout(nextPokeRef.current);
      if (channel) void supabase.removeChannel(channel);
    };
  }, [supabase, tournamentId]);

  // Foto del bracket: al montar y refrescada (placement/eliminated_phase no vienen por score:live).
  // Si la carga INICIAL falla (red/RPC), mostramos un estado de error con reintento en vez de quedar
  // en "Cargando…" para siempre; los refrescos posteriores que fallen se ignoran (ya hay snapshot).
  useEffect(() => {
    let active = true;
    const load = async () => {
      const { data, error } = await supabase.rpc("get_bracket", {
        p_tournament: tournamentId,
      });
      if (!active) return;
      if (data) {
        hasSnapshotRef.current = true;
        setSnapshot(data as BracketSnapshot);
        setLoadError(false);
      } else if (error && !hasSnapshotRef.current) {
        // Solo la carga INICIAL fallida se muestra; un refresco que falle con snapshot ya en mano
        // no rompe la pantalla.
        setLoadError(true);
      }
    };
    bracketLoadRef.current = () => void load();
    void load();
    const id = setInterval(() => void load(), 5000);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [supabase, tournamentId, retry]);

  // Decide la escena con `get_active_match`:
  //  • `am != null` → MI partido está vivo: hay penal abierto O estoy en el hueco corto ENTRE penales
  //    del mismo match. En ambos casos me quedo en la escena de penal y NO muestro el bracket (10.2:
  //    no flashear el grupo entre penal y penal). `<PenalLive>` (mismo `key`) espera el próximo
  //    `penal:start` por su canal sin remontarse.
  //  • `am == null` → terminó mi partido / tiempo muerto entre rondas: dejo ver el resultado un toque
  //    (linger corto) y después caigo a la tabla del grupo (Bracket "tu camino"), que se ve durante el
  //    tiempo muerto (10.3). Además pokeo `open_next_round` para abrir la próxima ronda apenas vence el
  //    `round_deadline` (el `tick()` server es backstop ≤10s).
  useEffect(() => {
    let active = true;
    const poll = async () => {
      const { data } = await supabase.rpc("get_active_match");
      if (!active) return;
      const am = data as ActiveMatch | null;
      // Backstop del poke preciso (`round:next`): si NO hay penal abierto (hueco intra-partido O entre
      // partidos) y ya venció el tiempo muerto, abrir la próxima ronda (idempotente, no-op si no). Sin
      // esto, intra-partido nadie pokeaba open_next_round y el penal lo abría recién el cron (≤10s).
      if (am?.penal == null) {
        fire(supabase.rpc("open_next_round", { p_tournament: tournamentId }));
      }
      if (am != null && am.match_id) {
        if (lingerRef.current) {
          clearTimeout(lingerRef.current);
          lingerRef.current = null;
        }
        setCurrentMatchId(am.match_id);
        setShowPenal(true);
        showPenalRef.current = true;
        setEverPlayed(true);
      } else {
        // Terminó mi partido → soltar la escena de penal tras el linger (los ~3s de animación).
        if (showPenalRef.current && !lingerRef.current) {
          const release = () => {
            const wait = lingerWaitMs(lastResultAtRef.current, Date.now());
            if (wait > 0) {
              lingerRef.current = setTimeout(release, wait);
              return;
            }
            setShowPenal(false);
            showPenalRef.current = false;
            lingerRef.current = null;
          };
          lingerRef.current = setTimeout(release, LATE_RESULT_GRACE_MS);
        }
      }
    };
    pollRef.current = poll;
    void poll();
    // Poll de 1s: detecta el fin del partido y la apertura del próximo penal con ≤1s de latencia
    // (clave para que el grupo entre jornadas se vea ~3s y no de refilón).
    const id = setInterval(() => void poll(), 1000);
    return () => {
      active = false;
      clearInterval(id);
      if (lingerRef.current) clearTimeout(lingerRef.current);
    };
  }, [supabase, tournamentId]);

  // B2.3: la revelación de nación (~2s) vive una sola vez al entrar. El effect solo agenda el fin de
  // la ventana al cargar el primer snapshot; QUÉ mostrar se deriva en el render (abajo).
  useEffect(() => {
    if (revealTimerRef.current || !snapshot) return;
    revealTimerRef.current = true;
    const id = setTimeout(() => setRevealExpired(true), REVEAL_MS);
    return () => clearTimeout(id);
  }, [snapshot]);

  // Afuera (no campeón): los cruces se ven al menos CROSSINGS_MIN_MS desde que el server me marcó.
  // Campeón: la pantalla de copa dura CHAMPION_MS. QUÉ mostrar lo decide `tournamentView` en el render.
  const meNow = snapshot?.participants.find((p) => p.participant_id === snapshot.my_participant_id) ?? null;
  const outNow = meNow != null && isOut({ hasTeam: true, eliminatedPhase: meNow.eliminated_phase, placement: meNow.placement });
  const championNow = meNow?.placement === 1;
  useEffect(() => {
    if (!outNow || championNow) return;
    const id = setTimeout(() => setCrossingsElapsed(true), CROSSINGS_MIN_MS);
    return () => clearTimeout(id);
  }, [outNow, championNow]);
  useEffect(() => {
    if (!championNow) return;
    const id = setTimeout(() => setChampionElapsed(true), CHAMPION_MS);
    return () => clearTimeout(id);
  }, [championNow]);

  const me = meNow;
  const finished = snapshot?.current_phase === "finished";
  const view = tournamentView({
    hasSnapshot: snapshot != null,
    loadError,
    penalActive: showPenal && currentMatchId != null,
    revealExpired,
    me: me ? { hasTeam: me.team_name != null, eliminatedPhase: me.eliminated_phase, placement: me.placement } : null,
    tournamentFinished: finished,
    nextRoundReady: nextRoundReady(
      me?.eliminated_phase ?? null,
      snapshot?.matches.map((m) => m.phase) ?? [],
      finished,
    ),
    crossingsElapsed,
    championElapsed,
    spectating,
  });

  if (view === "penal" && currentMatchId) {
    return <PenalLive key={currentMatchId} matchId={currentMatchId} onResult={onResult} />;
  }

  if (view === "error") {
    return (
      <Page center>
        <div className="flex flex-col items-center gap-4 text-center">
          <p className="text-balance text-sm text-fg-muted">
            No pudimos cargar el torneo. Revisá tu conexión y probá de nuevo.
          </p>
          <Button
            onClick={() => {
              setLoadError(false);
              setRetry((n) => n + 1);
            }}
            size="sm"
          >
            Reintentar
          </Button>
          <Link href="/" className="text-xs font-medium text-fg-subtle hover:text-fg-muted">
            Volver al inicio
          </Link>
        </div>
      </Page>
    );
  }

  if (!snapshot || view === "loading") {
    return (
      <Page center>
        <p className="text-sm text-fg-subtle">Cargando el torneo…</p>
      </Page>
    );
  }

  const mode = getMode(snapshot.mode_id);

  if (view === "reveal" && me) {
    return (
      <Page center>
        <TeamReveal me={me} />
      </Page>
    );
  }

  if (view === "champion") {
    return (
      <Page center>
        <Confetti />
        <div data-testid="champion-screen" className="fade-in relative z-10 flex flex-col items-center gap-3 text-center">
          <span className="text-8xl drop-shadow" aria-hidden>
            🏆
          </span>
          <span className="text-xs font-bold uppercase tracking-[0.2em] text-brand-ink">{mode.championTitle}</span>
          <p className="font-display text-5xl font-extrabold uppercase tracking-tight text-brand">
            {me?.team_name ?? "Campeón"}
          </p>
        </div>
      </Page>
    );
  }

  if (view === "summary") {
    return (
      <Page center>
        <RunSummary
          snapshot={snapshot}
          myParticipantId={snapshot.my_participant_id}
          isGuest={isGuest}
          onSpectate={finished ? undefined : () => setSpectating(true)}
        />
      </Page>
    );
  }

  if (view === "spectator") {
    return (
      <Page width="wide" center>
        <div
          data-testid="spectator-banner"
          className="fade-in relative z-10 flex flex-wrap items-center justify-center gap-3 rounded-md border-2 border-ink bg-bg-elevated px-4 py-2 text-sm font-semibold text-fg shadow-card"
        >
          <span>
            Estás mirando · quedaste afuera en{" "}
            {me?.eliminated_phase ? phaseInText(mode, me.eliminated_phase) : "el torneo"}
          </span>
          <Button type="button" variant="outline" size="sm" onClick={() => setSpectating(false)}>
            Ver mi resultado
          </Button>
        </div>
        <span hidden data-testid="tournament-view" data-view={view} />
        <Bracket view={buildBracketView(snapshot, live)} />
      </Page>
    );
  }

  // "crossings" (quedé afuera: cuadro con la ronda nueva armada) y "bracket" (sigo en carrera).
  return (
    <Page width="wide" center>
      {/* B5.2: mi tanda resolvió pero la ronda sigue (otros humanos terminando) → aviso de espera sobre
          el bracket. No en la presentación inicial (everPlayed=false) ni en los cruces. */}
      {everPlayed && view === "bracket" && (
        <div className="fade-in relative z-10 flex items-center gap-2 rounded-full border border-border bg-bg-elevated/80 px-4 py-1.5 text-xs font-medium text-fg-muted backdrop-blur-sm">
          <span className="flex gap-1" aria-hidden>
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand" />
          </span>
          Esperando que todos terminen su tanda…
        </div>
      )}
      <span hidden data-testid="tournament-view" data-view={view} />
      <Bracket view={buildBracketView(snapshot, live)} />
    </Page>
  );
}
