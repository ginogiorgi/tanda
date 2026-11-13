"use client";

/**
 * Resumen de fin de partido/torneo (8.6): se muestra cuando la corrida del jugador terminó
 * (eliminado o campeón). Marcador final del último partido + penal a penal + tu desenlace, con
 * "Jugar de nuevo" (quick_play) / "Inicio". Si sos invitado, además CTA "Creá una cuenta" (cierre
 * de 8.1). El campeón tiene su pantalla dedicada con trofeo/confeti en 8.12; acá va la versión base.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Confetti } from "@/components/penal/Confetti";
import { ResultCard } from "@/components/penal/ResultCard";
import { Button, buttonVariants } from "@/components/ui/Button";
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

function PenalDots({
  penals,
  side,
}: {
  penals: PenalRow[];
  side: string | null;
}) {
  const mine = penals.filter((p) => p.kicker_participant_id === side);
  if (mine.length === 0) return <span className="text-xs text-fg-subtle">—</span>;
  return (
    <span className="flex flex-wrap gap-1">
      {mine.map((p) => (
        <span
          key={p.idx}
          title={`Penal ${p.idx}`}
          className={`h-3 w-3 rounded-full ${p.scored ? "bg-success" : "bg-danger/60"}`}
        />
      ))}
    </span>
  );
}

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
}: {
  snapshot: BracketSnapshot;
  myParticipantId: string | null;
  isGuest: boolean;
}) {
  const router = useRouter();
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
        <span className="text-xs font-semibold uppercase tracking-[0.3em] text-fg-subtle">
          {isChampion ? mode.championTitle : "Fin del torneo"}
        </span>
        <p
          className={`font-display font-bold uppercase tracking-tight text-gold ${
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
          {/* Tarea 14: sin la leyenda "penal a penal"; quedan los dos tableros de penales. */}
          <div className="mt-4 flex items-center justify-between gap-4">
            <PenalDots penals={penals} side={lastMatch.home?.participant_id ?? null} />
            <PenalDots penals={penals} side={lastMatch.away?.participant_id ?? null} />
          </div>
        </ResultCard>
      )}

      <div className="flex w-full flex-col items-center gap-3">
        <Button type="button" onClick={playAgain} disabled={busy} block size="lg">
          {busy ? "Buscando…" : "Jugar de nuevo"}
        </Button>
        {error && <p className="text-sm text-danger">{error}</p>}
        {isGuest && (
          <Link
            href="/register"
            className={buttonVariants({
              variant: "outline",
              size: "lg",
              block: true,
              className: "border-gold/50 text-gold hover:border-gold",
            })}
          >
            Creá una cuenta para guardar tu progreso
          </Link>
        )}
        <Link
          href="/"
          className="text-sm font-medium text-fg-subtle transition-colors hover:text-fg-muted"
        >
          Inicio
        </Link>
      </div>
    </div>
  );
}
