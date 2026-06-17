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
import type { MatchPhase, ParticipantBrief, ScoreLivePayload } from "@/lib/realtime/score";
import type { BracketSnapshot } from "@/lib/bracket/bracket";

const PHASE_LABEL: Record<MatchPhase, string> = {
  group: "fase de grupos",
  round_of_32: "32avos",
  round_of_16: "octavos",
  quarters: "cuartos",
  semis: "semifinales",
  third_place: "el partido por el 3er puesto",
  final: "la final",
};

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

function Chip({ brief, isMe }: { brief: ParticipantBrief | null; isMe: boolean }) {
  return (
    <span className="flex items-center gap-2">
      <span
        className="h-4 w-4 rounded-full"
        style={{ backgroundColor: brief?.kit_primary ?? "#666" }}
        aria-hidden
      />
      <span className={`font-mono text-base font-bold ${isMe ? "text-gold" : "text-fg"}`}>
        {brief?.nation_code ?? "???"}
      </span>
    </span>
  );
}

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

function outcomeText(placement: number | null, eliminated: MatchPhase | null): string {
  if (placement === 1) return "¡Campeón! 🏆";
  if (placement === 2) return "Subcampeón 🥈";
  if (placement === 3) return "3er puesto 🥉";
  if (placement === 4) return "4º puesto";
  if (eliminated) return `Eliminado en ${PHASE_LABEL[eliminated]}`;
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

  const me = snapshot.participants.find((p) => p.participant_id === myParticipantId);
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
    setBusy(true);
    const { data, error } = await supabase.rpc("quick_play");
    const ref = (data as { code: string }[] | null)?.[0];
    if (error || !ref) {
      setBusy(false);
      return;
    }
    router.push(`/sala/${ref.code}`);
  }

  return (
    <div className="relative z-10 flex w-full max-w-md flex-col items-center gap-6 text-center">
      <div className="flex flex-col items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-[0.3em] text-fg-subtle">
          Fin del torneo
        </span>
        <p className="text-3xl font-extrabold tracking-tight text-gold">
          {outcomeText(me?.placement ?? null, me?.eliminated_phase ?? null)}
        </p>
      </div>

      {lastMatch && (
        <div className="w-full rounded-2xl border border-border bg-bg-elevated p-5">
          <div className="flex items-center justify-between">
            <Chip brief={lastMatch.home} isMe={lastMatch.home?.participant_id === myParticipantId} />
            <span className="font-mono text-2xl font-extrabold tabular-nums text-fg">
              {lastMatch.home_score}–{lastMatch.away_score}
            </span>
            <Chip brief={lastMatch.away} isMe={lastMatch.away?.participant_id === myParticipantId} />
          </div>
          <div className="mt-4 flex items-center justify-between gap-4">
            <PenalDots penals={penals} side={lastMatch.home?.participant_id ?? null} />
            <span className="text-[10px] uppercase tracking-wider text-fg-subtle">penal a penal</span>
            <PenalDots penals={penals} side={lastMatch.away?.participant_id ?? null} />
          </div>
        </div>
      )}

      <div className="flex w-full flex-col items-center gap-3">
        <button
          type="button"
          onClick={playAgain}
          disabled={busy}
          className="w-full rounded-lg bg-gold px-6 py-3 font-bold text-bg transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {busy ? "Buscando…" : "Jugar de nuevo"}
        </button>
        {isGuest && (
          <Link
            href="/register"
            className="w-full rounded-lg border border-gold/50 px-6 py-3 font-medium text-gold transition-colors hover:border-gold"
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
