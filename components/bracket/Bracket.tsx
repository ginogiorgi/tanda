"use client";

/**
 * Bracket del torneo (2D, 8.5), para cualquier modo (nombres de fase/zona salen de `lib/modes`). Presentacional: recibe la {@link BracketView} ya derivada
 * (datos + vivo los maneja TournamentLive). Qué se muestra depende de la fase:
 *  - **Grupos** (y arranque del torneo, tarea 3): tu grupo destacado + todas las tablas, para ver en
 *    qué posición vas/quedaste (tarea 17, antes del 1er KO).
 *  - **Eliminación** (tareas 16/8): el cartel de tu próximo rival arriba + el ÁRBOL COMPLETO de llaves
 *    (16avos→octavos→cuartos→semis→final) con scroll horizontal, mobile-first.
 * Sin assets FIFA: la nación se muestra por bandera real (B5.1, SVGs locales) + código + color de kit.
 */

import {
  kitSwatchStyle,
  type ParticipantBrief,
  type ScoreLivePayload,
} from "@/lib/realtime/score";
import { TeamMark } from "@/components/common/TeamMark";
import type { BracketView, GroupRow, GroupView, KoMatchView } from "@/lib/bracket/bracket";
import type { MatchPhase } from "@/lib/realtime/score";
import { useRef } from "react";
import { koPhasesFor, phaseLabel, type ModeMeta } from "@/lib/modes";


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
      <TeamMark flag={brief.flag} crest={brief.crest} name={brief.team_name} className={size === "xs" ? "h-3" : "h-3.5"} />
      <span
        className={`font-mono font-semibold ${size === "xs" ? "text-xs" : "text-sm"} ${
          isMe ? "text-brand" : "text-fg"
        }`}
      >
        {brief.team_code ?? "???"}
      </span>
    </span>
  );
}

function GroupTable({ group, compact, mode }: { group: GroupView; compact?: boolean; mode: ModeMeta }) {
  // Zonas largas (AR: 15) → filas más densas para que la tabla entre en mobile sin scrollear tanto.
  const long = group.rows.length > 6;
  const cutoff = mode.format.qualifiersPerZone;
  return (
    <div className="rounded-[6px] border-2 border-ink bg-bg-elevated p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-fg-muted">
          {mode.zoneNoun} {group.letter}
        </span>
        {!compact && <span className="text-xs text-fg-subtle">Pts</span>}
      </div>
      <ul className={`flex flex-col ${long ? "gap-0.5" : "gap-1.5"}`}>
        {group.rows.map((row) => (
          <li
            key={row.team.participant_id}
            className={`flex items-center justify-between rounded-[4px] px-2 ${long ? "py-0.5" : "py-1"} ${
              row.isMe ? "bg-brand/10" : ""
            } ${
              // Línea de corte: los de arriba pasan de ronda (en zonas largas orienta mucho más que el punto).
              long && row.position === cutoff ? "mb-1 rounded-b-none border-b border-dashed border-border" : ""
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
function VersusCard({ match, mode }: { match: ScoreLivePayload; mode: ModeMeta }) {
  const live = match.status === "in_progress" || match.status === "sudden_death";
  return (
    <div
      className={`w-full rounded-[6px] border bg-bg-elevated/70 p-5 text-center shadow-card backdrop-blur-md ${
        live ? "border-danger/50" : "border-brand/40"
      }`}
    >
      <span
        className={`inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.2em] ${
          live ? "text-danger" : "text-brand"
        }`}
      >
        {live && (
          <span className="h-1.5 w-1.5 rounded-full bg-danger motion-safe:animate-pulse" aria-hidden />
        )}
        {live ? "Jugando ahora" : "Tu próximo partido"} · {match.group_letter === null && match.phase === "group" ? "Interzonal" : phaseLabel(mode, match.phase)}
      </span>
      <div className="mt-3 flex items-center justify-center gap-4">
        <div className="flex flex-1 flex-col items-center gap-1">
          <TeamMark flag={match.home?.flag} crest={match.home?.crest} name={match.home?.team_name} className="h-8" />
          <span className="h-3 w-3 rounded-full" style={kitSwatchStyle(match.home)} aria-hidden />
          <span className="font-display text-xl font-extrabold uppercase text-fg">
            {match.home?.team_code}
          </span>
        </div>
        <span className="font-display text-3xl font-extrabold tabular-nums text-fg-muted">
          {live ? `${match.home_score}–${match.away_score}` : "vs"}
        </span>
        <div className="flex flex-1 flex-col items-center gap-1">
          <TeamMark flag={match.away?.flag} crest={match.away?.crest} name={match.away?.team_name} className="h-8" />
          <span className="h-3 w-3 rounded-full" style={kitSwatchStyle(match.away)} aria-hidden />
          <span className="font-display text-xl font-extrabold uppercase text-fg">
            {match.away?.team_code}
          </span>
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
        isMe ? "border-brand/70 bg-brand/10" : "border-border bg-bg-elevated"
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

interface TreeColumn {
  phase: MatchPhase;
  /** `null` = llave de una ronda que todavía no se armó (se dibuja vacía para ver el árbol entero). */
  slots: (KoMatchView | null)[];
}

/** Llave todavía sin equipos (ronda futura): mismo alto que una llave real. */
function EmptyMatch() {
  return (
    <div aria-hidden className="flex flex-col gap-1 rounded-md border border-dashed border-ink/30 px-2 py-1.5">
      <span className="font-mono text-xs leading-4 text-fg-subtle">—</span>
      <span className="font-mono text-xs leading-4 text-fg-subtle">—</span>
    </div>
  );
}

/** Una columna de fase. `connect` dibuja los conectores hacia la siguiente (`rev` = espejada, lado derecho). */
function PhaseColumn({
  col,
  label,
  connect,
  wide,
}: {
  col: TreeColumn;
  label: string;
  connect: "fwd" | "rev" | null;
  wide?: boolean;
}) {
  const mine = col.slots.some((m) => m?.isMe);
  return (
    <div className={`flex shrink-0 flex-col ${wide ? "w-32" : "w-24"}`} {...(mine ? { "data-mine": "" } : {})}>
      <span className="mb-2 text-center text-xs font-semibold uppercase tracking-wider text-fg-muted">{label}</span>
      {/* T16: celdas flex:1 + conectores CSS (.bracket-cell) en las columnas que alimentan a otra. */}
      <div className="flex flex-1 flex-col" {...(connect ? { "data-bracket-connect": connect } : {})}>
        {col.slots.map((m, i) => (
          <div key={m?.match.match_id ?? `${col.phase}-${i}`} className="bracket-cell">
            {m ? <TreeMatch m={m} /> : <EmptyMatch />}
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Árbol completo de eliminación (tarea 16). Feedback 2 (P4):
 *  · mobile/tablet: un lado, con scroll horizontal DEL COMPONENTE (nunca de la página) y tu columna
 *    centrada al montar;
 *  · `lg+`: dos lados que convergen en la final al centro → la mitad del alto, usando el ancho que sobra
 *    (la mitad de arriba de cada ronda alimenta la de arriba de la siguiente, así que se parte limpio).
 */
function BracketTree({ ko, mode }: { ko: BracketView["ko"]; mode: ModeMeta }) {
  const byPhase = new Map(ko.map((p) => [p.phase, p.matches]));
  const thirdPlace = byPhase.get("third_place") ?? [];
  const label = (phase: MatchPhase) => phaseLabel(mode, phase);

  // Desde la primera ronda armada hasta la final; las rondas que faltan, con llaves vacías (la mitad de
  // la anterior) → el árbol entero se ve desde los 16avos y se puede partir en dos lados.
  const phases = koPhasesFor(mode).filter((p) => p !== "third_place");
  const first = phases.findIndex((p) => byPhase.has(p));
  const columns: TreeColumn[] = [];
  let expected = first >= 0 ? (byPhase.get(phases[first]!)?.length ?? 0) : 0;
  for (const phase of first >= 0 ? phases.slice(first) : []) {
    const real = byPhase.get(phase);
    const slots: (KoMatchView | null)[] = real ?? Array.from({ length: expected }, () => null);
    columns.push({ phase, slots });
    expected = Math.max(1, Math.ceil(slots.length / 2));
  }

  // Dos lados si la última columna es la final (1 llave) y las anteriores son pares.
  const last = columns.at(-1);
  const twoSided = last !== undefined && last.slots.length === 1 && columns.slice(0, -1).every((c) => c.slots.length % 2 === 0);
  const sides = columns.slice(0, -1);
  const left = sides.map((c) => ({ ...c, slots: c.slots.slice(0, c.slots.length / 2) }));
  const right = sides.map((c) => ({ ...c, slots: c.slots.slice(c.slots.length / 2) })).reverse();

  // Centrar tu columna en mobile una sola vez (sin re-scrollear con cada marcador en vivo).
  const centered = useRef(false);
  const centerMine = (el: HTMLDivElement | null) => {
    if (!el || centered.current) return;
    const mine = el.querySelector<HTMLElement>("[data-mine]");
    centered.current = true;
    if (mine) el.scrollLeft = mine.offsetLeft - (el.clientWidth - mine.clientWidth) / 2;
  };

  return (
    <div className="w-full">
      <div ref={centerMine} className={`-mx-1 overflow-x-auto pb-2 ${twoSided ? "lg:hidden" : ""}`}>
        <div className="flex min-w-max gap-8 px-1">
          {columns.map((col, ci) => (
            <PhaseColumn key={col.phase} col={col} label={label(col.phase)} connect={ci < columns.length - 1 ? "fwd" : null} wide />
          ))}
        </div>
      </div>
      {twoSided && last && (
        <div data-bracket-tree="two-sided" className="hidden justify-center gap-5 [--bracket-gap:1.25rem] lg:flex">
          {left.map((col) => (
            <PhaseColumn key={`l-${col.phase}`} col={col} label={label(col.phase)} connect="fwd" />
          ))}
          <PhaseColumn col={last} label={label(last.phase)} connect={null} />
          {right.map((col) => (
            <PhaseColumn key={`r-${col.phase}`} col={col} label={label(col.phase)} connect="rev" />
          ))}
        </div>
      )}
      {thirdPlace.length > 0 && (
        <div className="mx-auto mt-3 flex w-32 flex-col">
          <span className="mb-2 text-center text-xs font-semibold uppercase tracking-wider text-fg-muted">
            {phaseLabel(mode, "third_place")}
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
          <span className="text-4xl">🏆</span>
          <TeamMark flag={view.champion.flag} crest={view.champion.crest} name={view.champion.team_name} className="h-8" />
          <span className="font-display text-2xl font-extrabold uppercase tracking-tight text-brand">
            {view.champion.team_code}
          </span>
          <span className="text-xs uppercase tracking-[0.3em] text-fg-subtle">{view.mode.championTitle}</span>
        </div>
        <BracketTree ko={view.ko} mode={view.mode} />
      </div>
    );
  }

  const inKnockout = view.phase !== "groups" && view.phase !== "finished" && view.ko.length > 0;

  // ── Eliminación directa: cartel de tu próximo rival (tarea 8) + árbol completo (tarea 16). ──
  if (inKnockout) {
    return (
      <div className="fade-in relative z-10 flex w-full flex-col items-center gap-5">
        {view.myNextMatch ? (
          <div className="w-full max-w-md">
            <VersusCard match={view.myNextMatch} mode={view.mode} />
          </div>
        ) : (
          <span className="text-xs font-bold uppercase tracking-[0.2em] text-brand-ink">
            Eliminación directa
          </span>
        )}
        <BracketTree ko={view.ko} mode={view.mode} />
      </div>
    );
  }

  // ── Fase de grupos (y arranque del torneo): tu grupo destacado + todas las tablas. ──
  const myGroup = view.groups.find((g) => g.letter === view.myGroupLetter);
  const otherGroups = view.groups.filter((g) => g.letter !== view.myGroupLetter);
  // Feedback 3 #3 — dos zonas (Argentino): tu próximo partido arriba y las DOS tablas lado a lado, mismo
  // componente y tamaño (antes la otra iba `compact` en una columna estirada y se veían distintas).
  if (view.groups.length === 2) {
    return (
      <div className="fade-in relative z-10 flex w-full flex-col items-center gap-5">
        <span className="text-xs font-bold uppercase tracking-[0.2em] text-brand-ink">
          Fase de {view.mode.zonesLabel.toLowerCase()}
        </span>
        {view.myNextMatch && (
          <div className="w-full max-w-md">
            <VersusCard match={view.myNextMatch} mode={view.mode} />
          </div>
        )}
        <div data-testid="zones-side-by-side" className="grid w-full max-w-md grid-cols-1 items-start gap-5 lg:max-w-4xl lg:grid-cols-2">
          {view.groups.map((g) => {
            const mine = g.letter === view.myGroupLetter;
            return (
              <div key={g.letter} data-zone={g.letter} data-mine={mine || undefined} className="w-full">
                <span className={`mb-2 block text-xs font-semibold uppercase tracking-wider ${mine ? "text-brand-ink" : "text-fg-muted"}`}>
                  {mine ? `Tu ${view.mode.zoneNoun.toLowerCase()}` : `La otra ${view.mode.zoneNoun.toLowerCase()}`}
                </span>
                <GroupTable group={g} mode={view.mode} />
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // Desktop (P4): tu partido y tu grupo a la izquierda; el resto en grilla de 2–3 columnas a la derecha.
  return (
    <div className="fade-in relative z-10 flex w-full flex-col items-center gap-5">
      <span className="text-xs font-bold uppercase tracking-[0.2em] text-brand-ink">
        Fase de {view.mode.zonesLabel.toLowerCase()}
      </span>
      <div className="flex w-full max-w-md flex-col gap-5 lg:grid lg:max-w-none lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] lg:items-start lg:gap-8">
        <div className="flex w-full flex-col gap-5">
          {view.myNextMatch && <VersusCard match={view.myNextMatch} mode={view.mode} />}
          {myGroup && (
            <div className="w-full">
              <span className="mb-2 block text-xs font-semibold uppercase tracking-wider text-brand">
                Tu {view.mode.zoneNoun.toLowerCase()}
              </span>
              <GroupTable group={myGroup} mode={view.mode} />
            </div>
          )}
        </div>
        {otherGroups.length > 0 && (
          <div className="flex w-full flex-col gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-fg-muted">
              {otherGroups.length === 1 ? `La otra ${view.mode.zoneNoun.toLowerCase()}` : `Otros ${view.mode.zonesLabel.toLowerCase()}`}
            </span>
            <div className={`grid gap-2 ${otherGroups.length === 1 ? "grid-cols-1" : "grid-cols-2 xl:grid-cols-3"}`}>
              {otherGroups.map((g) => (
                <GroupTable key={g.letter} group={g} compact mode={view.mode} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
