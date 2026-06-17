"use client";

/**
 * Bracket del Mundial (2D, 8.5). Vista por defecto "TU CAMINO" (tu próximo rival + tu grupo + tu
 * rama del árbol KO) con un botón "Ver todo el torneo" que abre el bracket completo (12 grupos +
 * eliminación). Presentacional: recibe la {@link BracketView} ya derivada (datos + vivo los maneja
 * TournamentLive). Sin assets FIFA: la nación se muestra por código + color de kit.
 */

import { useState } from "react";
import type { MatchPhase, ParticipantBrief, ScoreLivePayload } from "@/lib/realtime/score";
import type { BracketView, GroupRow, GroupView, KoMatchView } from "@/lib/bracket/bracket";

const PHASE_LABEL: Record<MatchPhase, string> = {
  group: "Grupos",
  round_of_32: "32avos",
  round_of_16: "Octavos",
  quarters: "Cuartos",
  semis: "Semis",
  third_place: "3er puesto",
  final: "Final",
};

const OUTCOME_DOT: Record<GroupRow["outcome"], string> = {
  qualifies: "bg-success",
  playoff: "bg-accent-orange",
  out: "bg-fg-subtle/40",
  pending: "bg-fg-subtle/40",
};

function TeamChip({
  brief,
  isMe,
  dim,
}: {
  brief: ParticipantBrief | null;
  isMe?: boolean;
  dim?: boolean;
}) {
  if (!brief) return <span className="text-fg-subtle">—</span>;
  return (
    <span className={`flex items-center gap-2 ${dim ? "opacity-50" : ""}`}>
      <span
        className="h-3 w-3 shrink-0 rounded-full"
        style={{ backgroundColor: brief.kit_primary ?? "#666" }}
        aria-hidden
      />
      <span className={`font-mono text-sm font-semibold ${isMe ? "text-gold" : "text-fg"}`}>
        {brief.nation_code ?? "???"}
      </span>
      {isMe && <span className="text-[10px] text-fg-subtle">(vos)</span>}
    </span>
  );
}

function GroupTable({ group, compact }: { group: GroupView; compact?: boolean }) {
  return (
    <div className="rounded-xl border border-border bg-bg-elevated p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-fg-muted">
          Grupo {group.letter}
        </span>
        {!compact && <span className="text-[10px] text-fg-subtle">Pts</span>}
      </div>
      <ul className="flex flex-col gap-1.5">
        {group.rows.map((row) => (
          <li
            key={row.team.participant_id}
            className={`flex items-center justify-between rounded-lg px-2 py-1 ${
              row.isMe ? "bg-gold/10" : ""
            }`}
          >
            <span className="flex items-center gap-2">
              <span className={`h-2 w-2 rounded-full ${OUTCOME_DOT[row.outcome]}`} aria-hidden />
              <span className="w-4 text-right font-mono text-xs text-fg-subtle">
                {row.position}
              </span>
              <TeamChip brief={row.team} isMe={row.isMe} dim={row.outcome === "out"} />
            </span>
            <span className="flex items-center gap-2 font-mono text-xs tabular-nums text-fg-muted">
              {!compact && (
                <span className="text-fg-subtle">
                  {row.standing.won}-{row.standing.drawn}-{row.standing.lost}
                </span>
              )}
              <span className="font-bold text-fg">{row.standing.points}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function MatchRow({ m }: { m: KoMatchView }) {
  const { match, isMe } = m;
  const live = match.status === "in_progress" || match.status === "sudden_death";
  const done = match.status === "finished";
  return (
    <div
      className={`flex items-center justify-between rounded-lg border px-3 py-2 ${
        isMe ? "border-gold/60 bg-gold/10" : "border-border bg-bg-elevated"
      }`}
    >
      <div className="flex flex-col gap-1">
        <TeamChip
          brief={match.home}
          isMe={isMe && match.home?.participant_id === match.winner_participant_id}
          dim={done && match.winner_participant_id !== match.home?.participant_id}
        />
        <TeamChip
          brief={match.away}
          isMe={isMe && match.away?.participant_id === match.winner_participant_id}
          dim={done && match.winner_participant_id !== match.away?.participant_id}
        />
      </div>
      <div className="flex flex-col items-end font-mono text-sm tabular-nums">
        {done || live ? (
          <>
            <span className="font-bold text-fg">{match.home_score}</span>
            <span className="font-bold text-fg">{match.away_score}</span>
          </>
        ) : (
          <span className="text-[10px] uppercase text-fg-subtle">vs</span>
        )}
      </div>
      {live && (
        <span className="ml-2 h-2 w-2 animate-pulse rounded-full bg-danger" aria-hidden />
      )}
    </div>
  );
}

function VersusCard({ match }: { match: ScoreLivePayload }) {
  const live = match.status === "in_progress" || match.status === "sudden_death";
  return (
    <div className="w-full rounded-2xl border border-gold/40 bg-bg-elevated p-5 text-center">
      <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-gold">
        {live ? "Jugando ahora" : "Tu próximo partido"} · {PHASE_LABEL[match.phase]}
        {match.group_letter ? ` ${match.group_letter}` : ""}
      </span>
      <div className="mt-3 flex items-center justify-center gap-4">
        <div className="flex flex-1 flex-col items-center gap-1">
          <span
            className="h-8 w-8 rounded-full"
            style={{ backgroundColor: match.home?.kit_primary ?? "#666" }}
            aria-hidden
          />
          <span className="font-mono text-lg font-bold text-fg">{match.home?.nation_code}</span>
        </div>
        <span className="font-mono text-2xl font-extrabold tabular-nums text-fg-muted">
          {live ? `${match.home_score}–${match.away_score}` : "vs"}
        </span>
        <div className="flex flex-1 flex-col items-center gap-1">
          <span
            className="h-8 w-8 rounded-full"
            style={{ backgroundColor: match.away?.kit_primary ?? "#666" }}
            aria-hidden
          />
          <span className="font-mono text-lg font-bold text-fg">{match.away?.nation_code}</span>
        </div>
      </div>
    </div>
  );
}

export function Bracket({ view }: { view: BracketView }) {
  const [showAll, setShowAll] = useState(false);
  const myGroup = view.groups.find((g) => g.letter === view.myGroupLetter);
  const myKo = view.ko
    .map((p) => ({ phase: p.phase, matches: p.matches.filter((m) => m.isMe) }))
    .filter((p) => p.matches.length > 0);

  return (
    <div className="relative z-10 flex w-full max-w-md flex-col items-center gap-5">
      {view.champion ? (
        <div className="flex flex-col items-center gap-1 text-center">
          <span className="text-3xl">🏆</span>
          <span className="font-mono text-lg font-bold text-gold">
            {view.champion.nation_code}
          </span>
          <span className="text-xs text-fg-subtle">campeón</span>
        </div>
      ) : (
        <span className="text-xs font-semibold uppercase tracking-[0.3em] text-fg-subtle">
          {showAll ? "Torneo" : "Tu camino"}
        </span>
      )}

      {!showAll ? (
        <>
          {view.myNextMatch && <VersusCard match={view.myNextMatch} />}
          {myGroup && <GroupTable group={myGroup} />}
          {myKo.length > 0 && (
            <div className="flex w-full flex-col gap-2">
              {myKo.map((p) => (
                <div key={p.phase} className="flex flex-col gap-1.5">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-fg-muted">
                    {PHASE_LABEL[p.phase]}
                  </span>
                  {p.matches.map((m) => (
                    <MatchRow key={m.match.match_id} m={m} />
                  ))}
                </div>
              ))}
            </div>
          )}
          <button
            type="button"
            onClick={() => setShowAll(true)}
            className="rounded-lg border border-border px-5 py-2.5 text-sm font-medium text-fg transition-colors hover:border-fg-subtle"
          >
            Ver todo el torneo
          </button>
        </>
      ) : (
        <>
          <button
            type="button"
            onClick={() => setShowAll(false)}
            className="rounded-lg border border-border px-5 py-2.5 text-sm font-medium text-fg transition-colors hover:border-fg-subtle"
          >
            ← Volver a tu camino
          </button>
          {view.ko.length > 0 && (
            <div className="flex w-full flex-col gap-4">
              <span className="text-xs font-semibold uppercase tracking-wider text-gold">
                Eliminación
              </span>
              {view.ko.map((p) => (
                <div key={p.phase} className="flex flex-col gap-1.5">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-fg-muted">
                    {PHASE_LABEL[p.phase]}
                  </span>
                  {p.matches.map((m) => (
                    <MatchRow key={m.match.match_id} m={m} />
                  ))}
                </div>
              ))}
            </div>
          )}
          <div className="flex w-full flex-col gap-3">
            <span className="text-xs font-semibold uppercase tracking-wider text-gold">Grupos</span>
            {view.groups.map((g) => (
              <GroupTable key={g.letter} group={g} compact />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
