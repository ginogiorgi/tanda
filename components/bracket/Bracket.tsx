"use client";

/**
 * Bracket del Mundial (2D, 8.5). Presentacional: recibe la {@link BracketView} ya derivada
 * (datos + vivo los maneja TournamentLive). Qué se muestra depende de la fase:
 *  - **Grupos** (y arranque del torneo, tarea 3): tu grupo destacado + todas las tablas, para ver en
 *    qué posición vas/quedaste (tarea 17, antes del 1er KO).
 *  - **Eliminación** (tareas 16/8): el cartel de tu próximo rival arriba + el ÁRBOL COMPLETO de llaves
 *    (16avos→octavos→cuartos→semis→final) con scroll horizontal, mobile-first.
 * Sin assets FIFA: la nación se muestra por código + color de kit.
 */

import {
  kitSwatchStyle,
  type MatchPhase,
  type ParticipantBrief,
  type ScoreLivePayload,
} from "@/lib/realtime/score";
import type { BracketView, GroupRow, GroupView, KoMatchView } from "@/lib/bracket/bracket";

const PHASE_LABEL: Record<MatchPhase, string> = {
  group: "Grupos",
  round_of_32: "16avos",
  round_of_16: "Octavos",
  quarters: "Cuartos",
  semis: "Semis",
  third_place: "3er puesto",
  final: "Final",
};

/** Columnas del árbol (de 16avos a la final). El 3er puesto va aparte, no es parte del árbol. */
const TREE_PHASES: MatchPhase[] = ["round_of_32", "round_of_16", "quarters", "semis", "final"];

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
  size = "sm",
}: {
  brief: ParticipantBrief | null;
  isMe?: boolean;
  dim?: boolean;
  size?: "sm" | "xs";
}) {
  if (!brief) return <span className="text-fg-subtle">—</span>;
  return (
    <span className={`flex items-center gap-1.5 ${dim ? "opacity-50" : ""}`}>
      <span
        className={`${size === "xs" ? "h-2 w-2" : "h-3 w-3"} shrink-0 rounded-full`}
        style={kitSwatchStyle(brief)}
        aria-hidden
      />
      <span
        className={`font-mono font-semibold ${size === "xs" ? "text-xs" : "text-sm"} ${
          isMe ? "text-gold" : "text-fg"
        }`}
      >
        {brief.nation_code ?? "???"}
      </span>
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

/** Cartel "contra quién vas a jugar" (tarea 8): encabezado fijo del bracket de eliminación. */
function VersusCard({ match }: { match: ScoreLivePayload }) {
  const live = match.status === "in_progress" || match.status === "sudden_death";
  return (
    <div className="w-full rounded-2xl border border-gold/40 bg-bg-elevated p-5 text-center">
      <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-gold">
        {live ? "Jugando ahora" : "Tu próximo partido"} · {PHASE_LABEL[match.phase]}
      </span>
      <div className="mt-3 flex items-center justify-center gap-4">
        <div className="flex flex-1 flex-col items-center gap-1">
          <span
            className="h-8 w-8 rounded-full"
            style={kitSwatchStyle(match.home)}
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
            style={kitSwatchStyle(match.away)}
            aria-hidden
          />
          <span className="font-mono text-lg font-bold text-fg">{match.away?.nation_code}</span>
        </div>
      </div>
    </div>
  );
}

/** Una llave del árbol: dos equipos apilados + su marcador. Resalta la tuya. */
function TreeMatch({ m }: { m: KoMatchView }) {
  const { match, isMe } = m;
  const live = match.status === "in_progress" || match.status === "sudden_death";
  const done = match.status === "finished";
  const showScore = done || live;
  const row = (brief: ParticipantBrief | null, score: number, isWinner: boolean) => (
    <div className="flex items-center justify-between gap-1">
      <TeamChip
        brief={brief}
        size="xs"
        isMe={isMe && isWinner}
        dim={done && !isWinner}
      />
      <span className="font-mono text-xs font-bold tabular-nums text-fg">
        {showScore ? score : ""}
      </span>
    </div>
  );
  return (
    <div
      className={`flex flex-col gap-1 rounded-md border px-2 py-1.5 ${
        isMe ? "border-gold/70 bg-gold/10" : "border-border bg-bg-elevated"
      }`}
    >
      {row(match.home, match.home_score, match.winner_participant_id === match.home?.participant_id)}
      {row(match.away, match.away_score, match.winner_participant_id === match.away?.participant_id)}
      {live && (
        <span className="mx-auto mt-0.5 h-1.5 w-1.5 animate-pulse rounded-full bg-danger" aria-hidden />
      )}
    </div>
  );
}

/** Árbol completo de eliminación (tarea 16): columnas por fase con scroll horizontal (mobile-first). */
function BracketTree({ ko }: { ko: BracketView["ko"] }) {
  const byPhase = new Map(ko.map((p) => [p.phase, p.matches]));
  const columns = TREE_PHASES.map((phase) => ({ phase, matches: byPhase.get(phase) ?? [] })).filter(
    (c) => c.matches.length > 0,
  );
  const thirdPlace = byPhase.get("third_place") ?? [];

  return (
    <div className="w-full">
      <div className="-mx-1 overflow-x-auto pb-2">
        <div className="flex min-w-max gap-3 px-1">
          {columns.map(({ phase, matches }) => (
            <div key={phase} className="flex w-32 shrink-0 flex-col">
              <span className="mb-2 text-center text-[10px] font-semibold uppercase tracking-wider text-fg-muted">
                {PHASE_LABEL[phase]}
              </span>
              <div className="flex flex-1 flex-col justify-around gap-2">
                {matches.map((m) => (
                  <TreeMatch key={m.match.match_id} m={m} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
      {thirdPlace.length > 0 && (
        <div className="mt-3 flex w-32 flex-col">
          <span className="mb-2 text-center text-[10px] font-semibold uppercase tracking-wider text-fg-muted">
            {PHASE_LABEL.third_place}
          </span>
          {thirdPlace.map((m) => (
            <TreeMatch key={m.match.match_id} m={m} />
          ))}
        </div>
      )}
    </div>
  );
}

export function Bracket({ view }: { view: BracketView }) {
  // Campeón coronado → banner (la pantalla dedicada de campeón es RunSummary).
  if (view.champion) {
    return (
      <div className="fade-in relative z-10 flex w-full max-w-md flex-col items-center gap-4">
        <div className="flex flex-col items-center gap-1 text-center">
          <span className="text-3xl">🏆</span>
          <span className="font-mono text-lg font-bold text-gold">
            {view.champion.nation_code}
          </span>
          <span className="text-xs text-fg-subtle">campeón</span>
        </div>
        <BracketTree ko={view.ko} />
      </div>
    );
  }

  const inKnockout = view.phase !== "groups" && view.phase !== "finished" && view.ko.length > 0;

  // ── Eliminación directa: cartel de tu próximo rival (tarea 8) + árbol completo (tarea 16). ──
  if (inKnockout) {
    return (
      <div className="fade-in relative z-10 flex w-full max-w-3xl flex-col items-center gap-5">
        {view.myNextMatch ? (
          <div className="w-full max-w-md">
            <VersusCard match={view.myNextMatch} />
          </div>
        ) : (
          <span className="text-xs font-semibold uppercase tracking-[0.3em] text-fg-subtle">
            Eliminación directa
          </span>
        )}
        <BracketTree ko={view.ko} />
      </div>
    );
  }

  // ── Fase de grupos (y arranque del torneo): tu grupo destacado + todas las tablas. ──
  const myGroup = view.groups.find((g) => g.letter === view.myGroupLetter);
  const otherGroups = view.groups.filter((g) => g.letter !== view.myGroupLetter);
  return (
    <div className="fade-in relative z-10 flex w-full max-w-md flex-col items-center gap-5">
      <span className="text-xs font-semibold uppercase tracking-[0.3em] text-fg-subtle">
        Fase de grupos
      </span>
      {view.myNextMatch && <VersusCard match={view.myNextMatch} />}
      {myGroup && (
        <div className="w-full">
          <span className="mb-2 block text-[11px] font-semibold uppercase tracking-wider text-gold">
            Tu grupo
          </span>
          <GroupTable group={myGroup} />
        </div>
      )}
      {otherGroups.length > 0 && (
        <div className="flex w-full flex-col gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-fg-muted">
            Otros grupos
          </span>
          <div className="grid grid-cols-2 gap-2">
            {otherGroups.map((g) => (
              <GroupTable key={g.letter} group={g} compact />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
