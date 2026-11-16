"use client";

/**
 * Resumen de fin de partido/torneo (8.6): se muestra cuando la corrida del jugador terminó
 * (eliminado o campeón). Marcador final del último partido + penal a penal + tu desenlace, con
 * acciones de `ResultActions` (P5): Jugar de nuevo (quick_play) / Ver cómo sigue (si el torneo sigue) /
 * Volver al inicio, y la invitación a crear cuenta para el invitado.
 */

import { useEffect, useState } from "react";
import { useNav } from "@/lib/nav/useNav";
import { createClient } from "@/lib/supabase/client";
import { Confetti } from "@/components/penal/Confetti";
import { ResultCard } from "@/components/penal/ResultCard";
import { PenaltyDots } from "@/components/penal/PenaltyDots";
import { ResultActions, type ResultAction } from "@/components/ui/ResultActions";
import { penaltyBoard } from "@/lib/penal/dots";
import { kicksPerSide } from "@/lib/engine/match";
import type { MatchPhase, ScoreLivePayload } from "@/lib/realtime/score";
import type { BracketSnapshot } from "@/lib/bracket/bracket";
import { getMode, phaseInText, type ModeMeta } from "@/lib/modes";

const PHASE_RANK: Record<MatchPhase, number> = {
  group: 0,
  round_of_32: 1,
  round_of_16: 2,
  quarters: 3,
  semis: 4,
  third_place: 5,
  final: 6,
};

type PenalRow = {
  idx: number;
  kicker_participant_id: string;
  scored: boolean;
  reason: string;
};

function outcomeText(mode: ModeMeta, placement: number | null, eliminated: MatchPhase | null): string {
  if (placement === 1) return "¡Campeón!";
  if (placement === 2) return "Subcampeón 🥈";
  if (placement === 3) return "3er puesto 🥉";
  if (placement === 4) return "4º puesto";
  if (eliminated) return `Eliminado en ${phaseInText(mode, eliminated)}`;
  return "Fin del torneo";
}

export function RunSummary({
  snapshot,
  myParticipantId,
  isGuest,
  onSpectate,
}: {
  snapshot: BracketSnapshot;
  myParticipantId: string | null;
  isGuest: boolean;
  /** "Ver cómo sigue": solo mientras el torneo está en juego (si no, el botón no aparece). */
  onSpectate?: () => void;
}) {
  const router = useNav();
  const [supabase] = useState(() => createClient());
  const [penals, setPenals] = useState<PenalRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mode = getMode(snapshot.mode_id);
  const me = snapshot.participants.find((p) => p.participant_id === myParticipantId);
  const isChampion = me?.placement === 1;
  // Mi último partido = el de fase más avanzada donde jugué y terminó.
  const myMatches = snapshot.matches
    .filter(
      (m) =>
        m.status === "finished" &&
        (m.home?.participant_id === myParticipantId ||
          m.away?.participant_id === myParticipantId),
    )
    .sort((a, b) => PHASE_RANK[b.phase] - PHASE_RANK[a.phase]);
  const lastMatch: ScoreLivePayload | undefined = myMatches[0];

  useEffect(() => {
    if (!lastMatch) return;
    let active = true;
    void (async () => {
      const { data } = await supabase.rpc("get_match_penals", { p_match: lastMatch.match_id });
      if (active && Array.isArray(data)) setPenals(data as PenalRow[]);
    })();
    return () => {
      active = false;
    };
  }, [supabase, lastMatch]);

  // Tablero del último partido: home patea los impares; `scored` es desde el pateador.
  const kicksOf = (pid: string | null | undefined) =>
    penals.filter((p) => p.kicker_participant_id === pid).sort((x, y) => x.idx - y.idx).map((p) => p.scored);
  const board = penaltyBoard(
    kicksOf(lastMatch?.home?.participant_id),
    kicksOf(lastMatch?.away?.participant_id),
    kicksPerSide(lastMatch?.phase === "group" ? "group" : "elimination"),
  );
  const home: ResultAction = { label: "Volver al inicio", href: "/" };
  const secondary: [ResultAction] | [ResultAction, ResultAction] = onSpectate
    ? [{ label: "Ver cómo sigue", onClick: onSpectate }, home]
    : [home];

  async function playAgain() {
    setError(null);
    setBusy(true);
    const { data, error: rpcError } = await supabase.rpc("quick_play", { p_mode: mode.id });
    const ref = (data as { code: string }[] | null)?.[0];
    if (rpcError || !ref) {
      setBusy(false);
      setError("No pudimos armar otra partida. Probá de nuevo en un momento.");
      return;
    }
    router.push(`/sala/${ref.code}`);
  }

  return (
    <div className="fade-in relative z-10 flex w-full max-w-md flex-col items-center gap-6 text-center">
      {/* El confeti cae por encima (overlay absoluto), así que no necesita empujar el contenido. */}
      {isChampion && <Confetti />}
      {/* T14: el header va sin offset condicional → todos los estados (campeón / subcampeón /
          eliminado) quedan centrados parejo dentro del mismo contenedor max-w-md. */}
      <div className="flex flex-col items-center gap-2">
        {isChampion && <span className="mb-2 text-7xl drop-shadow">🏆</span>}
        <span className="text-xs font-bold uppercase tracking-[0.2em] text-brand-ink">
          {isChampion ? mode.championTitle : "Fin del torneo"}
        </span>
        <p
          className={`font-display font-extrabold uppercase tracking-tight text-brand ${
            isChampion ? "text-5xl" : "text-4xl"
          }`}
        >
          {outcomeText(mode, me?.placement ?? null, me?.eliminated_phase ?? null)}
        </p>
      </div>

      {lastMatch && (
        <ResultCard
          left={{
            code: lastMatch.home?.team_code ?? null,
            kit: lastMatch.home?.kit_primary ?? null,
            flag: lastMatch.home?.flag ?? null,
            crest: lastMatch.home?.crest ?? null,
            isMe: lastMatch.home?.participant_id === myParticipantId,
          }}
          right={{
            code: lastMatch.away?.team_code ?? null,
            kit: lastMatch.away?.kit_primary ?? null,
            flag: lastMatch.away?.flag ?? null,
            crest: lastMatch.away?.crest ?? null,
            isMe: lastMatch.away?.participant_id === myParticipantId,
          }}
          leftScore={lastMatch.home_score}
          rightScore={lastMatch.away_score}
        >
          <div className="mt-4 flex items-center justify-between gap-4">
            <PenaltyDots
              states={board.home}
              team={lastMatch.home?.team_name ?? "local"}
              size="md"
            />
            <PenaltyDots
              states={board.away}
              team={lastMatch.away?.team_name ?? "visitante"}
              align="right"
              size="md"
            />
          </div>
        </ResultCard>
      )}

      <ResultActions
        primary={{ label: busy ? "Buscando…" : "Jugar de nuevo", onClick: () => void playAgain(), disabled: busy }}
        secondary={secondary}
        guest={isGuest}
        error={error}
      />
    </div>
  );
}
