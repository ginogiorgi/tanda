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
import { Bracket } from "@/components/bracket/Bracket";
import { buildBracketView, type BracketSnapshot } from "@/lib/bracket/bracket";
import {
  applyScoreUpdate,
  type ScoreboardState,
  type ScoreLivePayload,
} from "@/lib/realtime/score";
import type { ActiveMatch } from "@/lib/realtime/penal";

/** Cuánto se mantiene la pantalla del penal tras resolver (GOL/ATAJADO) antes de ceder al bracket. */
const RESULT_LINGER_MS = 3500;

export function TournamentLive({
  tournamentId,
  isGuest,
}: {
  tournamentId: string;
  isGuest: boolean;
}) {
  const [supabase] = useState(() => createClient());
  const [snapshot, setSnapshot] = useState<BracketSnapshot | null>(null);
  const [live, setLive] = useState<ScoreboardState>({});
  const [currentMatchId, setCurrentMatchId] = useState<string | null>(null);
  const [showPenal, setShowPenal] = useState(false);
  const lingerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
  useEffect(() => {
    let active = true;
    const load = async () => {
      const { data } = await supabase.rpc("get_bracket", { p_tournament: tournamentId });
      if (active && data) setSnapshot(data as BracketSnapshot);
    };
    void load();
    const id = setInterval(() => void load(), 5000);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [supabase, tournamentId]);

  // Detecta el penal abierto: si lo hay → pantalla de penal; si no → bracket (con linger tras el
  // resultado para que se vea GOL/ATAJADO antes de ceder al bracket en el tiempo muerto).
  useEffect(() => {
    let active = true;
    const poll = async () => {
      const { data } = await supabase.rpc("get_active_match");
      if (!active) return;
      const am = data as ActiveMatch | null;
      const open = am?.penal != null;
      if (open && am?.match_id) {
        if (lingerRef.current) {
          clearTimeout(lingerRef.current);
          lingerRef.current = null;
        }
        setCurrentMatchId(am.match_id);
        setShowPenal(true);
      } else if (!lingerRef.current) {
        // Ningún penal abierto: dejá ver el penal un toque más (resultado) y después el bracket.
        lingerRef.current = setTimeout(() => {
          setShowPenal(false);
          lingerRef.current = null;
        }, RESULT_LINGER_MS);
      }
    };
    void poll();
    const id = setInterval(() => void poll(), 1500);
    return () => {
      active = false;
      clearInterval(id);
      if (lingerRef.current) clearTimeout(lingerRef.current);
    };
  }, [supabase]);

  if (showPenal && currentMatchId) {
    return <PenalLive key={currentMatchId} matchId={currentMatchId} />;
  }

  if (!snapshot) {
    return <p className="text-sm text-fg-subtle">Cargando el torneo…</p>;
  }

  // Mi corrida terminó (eliminado o coronado) → resumen de fin de torneo (8.6).
  const me = snapshot.participants.find((p) => p.participant_id === snapshot.my_participant_id);
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
