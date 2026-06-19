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

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { PenalLive } from "@/components/penal/PenalLive";
import { RunSummary } from "@/components/penal/RunSummary";
import { NationReveal } from "@/components/penal/NationReveal";
import { Bracket } from "@/components/bracket/Bracket";
import { buildBracketView, type BracketSnapshot } from "@/lib/bracket/bracket";
import {
  applyScoreUpdate,
  type ScoreboardState,
  type ScoreLivePayload,
} from "@/lib/realtime/score";
import type { ActiveMatch } from "@/lib/realtime/penal";

/**
 * Cuánto se mantiene la pantalla del penal tras terminar el PARTIDO (GOL/ATAJADO del último penal)
 * antes de ceder a la tabla del grupo en el tiempo muerto (10.3). Corto a propósito: el tiempo muerto
 * del server es ~3s, así que un linger largo se comía toda la ventana y el grupo no llegaba a verse.
 */
const RESULT_LINGER_MS = 1200;

/** Cuánto dura la pantalla de revelación de nación (B2.3) antes de ceder al bracket. */
const REVEAL_MS = 2200;

export function TournamentLive({
  tournamentId,
  isGuest,
}: {
  tournamentId: string;
  isGuest: boolean;
}) {
  const [supabase] = useState(() => createClient());
  const [snapshot, setSnapshot] = useState<BracketSnapshot | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [live, setLive] = useState<ScoreboardState>({});
  const [currentMatchId, setCurrentMatchId] = useState<string | null>(null);
  const [showPenal, setShowPenal] = useState(false);
  const [revealExpired, setRevealExpired] = useState(false);
  const lingerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showPenalRef = useRef(false);
  const hasSnapshotRef = useRef(false);
  const revealTimerRef = useRef(false);

  // B2.1: arrancar la ventana de presentación AL ENTRAR a /partido (no en start_tournament). Idempotente
  // en el server (1ª llamada de un humano comprime el backstop a ~6s; las siguientes son no-op).
  useEffect(() => {
    void supabase.rpc("begin_presentation", { p_tournament: tournamentId });
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
        .subscribe();
    })();
    return () => {
      active = false;
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
      if (am != null && am.match_id) {
        if (lingerRef.current) {
          clearTimeout(lingerRef.current);
          lingerRef.current = null;
        }
        setCurrentMatchId(am.match_id);
        setShowPenal(true);
        showPenalRef.current = true;
      } else {
        // Sin partido activo → arrancar la próxima ronda si el tiempo muerto ya venció (idempotente,
        // no-op si todavía no), y soltar la escena de penal tras el linger corto.
        void supabase.rpc("open_next_round", { p_tournament: tournamentId });
        if (showPenalRef.current && !lingerRef.current) {
          lingerRef.current = setTimeout(() => {
            setShowPenal(false);
            showPenalRef.current = false;
            lingerRef.current = null;
          }, RESULT_LINGER_MS);
        }
      }
    };
    void poll();
    const id = setInterval(() => void poll(), 1500);
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

  if (showPenal && currentMatchId) {
    return <PenalLive key={currentMatchId} matchId={currentMatchId} />;
  }

  if (!snapshot) {
    if (loadError) {
      return (
        <div className="flex flex-col items-center gap-4 text-center">
          <p className="text-balance text-sm text-fg-muted">
            No pudimos cargar el torneo. Revisá tu conexión y probá de nuevo.
          </p>
          <button
            onClick={() => {
              setLoadError(false);
              setRetry((n) => n + 1);
            }}
            className="rounded-lg bg-gold px-6 py-2.5 text-sm font-semibold text-bg transition-opacity hover:opacity-90"
          >
            Reintentar
          </button>
          <Link href="/" className="text-xs font-medium text-fg-subtle hover:text-fg-muted">
            Volver al inicio
          </Link>
        </div>
      );
    }
    return <p className="text-sm text-fg-subtle">Cargando el torneo…</p>;
  }

  // Mi corrida terminó (eliminado o coronado) → resumen de fin de torneo (8.6).
  const me = snapshot.participants.find((p) => p.participant_id === snapshot.my_participant_id);

  // Revelación de nación (B2.3): una sola vez al entrar (ventana no vencida) y solo si recién arranca
  // (no eliminado/coronado → así un refresh tardío cae directo al bracket/resumen, no a la revelación).
  if (
    !revealExpired &&
    me?.nation_name &&
    me.eliminated_phase == null &&
    me.placement == null
  ) {
    return <NationReveal me={me} />;
  }

  if (me && (me.eliminated_phase != null || me.placement != null)) {
    return (
      <RunSummary
        snapshot={snapshot}
        myParticipantId={snapshot.my_participant_id}
        isGuest={isGuest}
      />
    );
  }

  return (
    <>
      <Bracket view={buildBracketView(snapshot, live)} />
      <Link
        href="/"
        className="relative z-10 text-xs font-medium text-fg-subtle transition-colors hover:text-fg-muted"
      >
        Volver al inicio
      </Link>
    </>
  );
}
