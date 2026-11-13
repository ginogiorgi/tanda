/**
 * Bracket del torneo — armado PURO (sin red) a partir de la foto inicial (`get_bracket`) + el
 * estado en vivo (`score:live` reducido con `applyScoreUpdate`). Reúsa el motor de torneo
 * (`rankGroup`) para las posiciones de grupo, así la tabla del cliente respeta los desempates FIFA.
 *
 * Patrón espejo de `lib/realtime/score.ts` (datos) — acá vive la DERIVACIÓN para el render del
 * bracket (8.5): los 12 grupos rankeados, el árbol de eliminación por fase y "tu camino" (tu grupo,
 * tu próximo rival). Sin three, sin red → testeable.
 *
 * Nota: el `seed` del torneo NO viaja al cliente (anti-trampa: revelaría intents de bots y la
 * selección de preguntas). El desempate por sorteo de `rankGroup` se aproxima con seed 0 — solo
 * afecta el ORDEN VISUAL entre equipos empatados en todo (puntos+DG+GF+h2h); la clasificación real
 * la fija el server (`placement`/`eliminated_phase`) al cerrar los grupos.
 */

import type { GroupMatchResult, Standing } from "@/lib/engine/tournament";
import { rankZone, type Tiebreak } from "@/lib/engine/formats";
import { KO_PHASES, getMode, type ModeMeta } from "@/lib/modes";
import {
  applyScoreUpdate,
  type MatchPhase,
  type ParticipantBrief,
  type ScoreboardState,
  type ScoreLivePayload,
} from "@/lib/realtime/score";

/** Fase del torneo (enum `tournament_phase` de la DB). */
export type TournamentPhase =
  | "groups"
  | "round_of_32"
  | "round_of_16"
  | "quarters"
  | "semis"
  | "final"
  | "finished";

/** Participante del bracket: brief de nación + su grupo + estado de eliminación/podio. */
export interface BracketTeam extends ParticipantBrief {
  group_letter: string | null;
  placement: number | null;
  eliminated_phase: MatchPhase | null;
}

/** Formato del torneo según `game_modes` (lo manda `get_bracket`). */
export interface BracketFormat {
  qualifiers_per_zone: number;
  best_thirds: number;
  knockout_start: MatchPhase;
  third_place: boolean;
  tiebreak: Tiebreak;
}

/** Foto inicial del bracket (RPC `get_bracket`). */
export interface BracketSnapshot {
  tournament_id: string;
  mode_id: string;
  format: BracketFormat;
  my_participant_id: string | null;
  current_phase: TournamentPhase;
  round_deadline: string | null;
  champion_participant_id: string | null;
  participants: BracketTeam[];
  matches: ScoreLivePayload[];
}

/** Desenlace de una fila de grupo, para el color del render. */
export type GroupOutcome = "qualifies" | "playoff" | "out" | "pending";

export interface GroupRow {
  team: BracketTeam;
  standing: Standing<string>;
  position: number;
  isMe: boolean;
  outcome: GroupOutcome;
}

export interface GroupView {
  letter: string;
  rows: GroupRow[];
}

export interface KoMatchView {
  match: ScoreLivePayload;
  isMe: boolean;
}

export interface KoPhaseView {
  phase: MatchPhase;
  matches: KoMatchView[];
}

export interface BracketView {
  mode: ModeMeta;
  /** Fase actual del torneo (gobierna qué se muestra: grupos vs árbol de eliminación). */
  phase: TournamentPhase;
  groups: GroupView[];
  ko: KoPhaseView[];
  myGroupLetter: string | null;
  /** Próximo partido donde juega el caller y que aún no terminó (grupo o KO). */
  myNextMatch: ScoreLivePayload | null;
  champion: ParticipantBrief | null;
}

const ACTIVE: ScoreLivePayload["status"][] = ["pending", "in_progress", "sudden_death"];

/** Mergea la foto inicial con el vivo (último-gana por `server_now`, vía applyScoreUpdate). */
function mergeMatches(snap: BracketSnapshot, live: ScoreboardState): Map<string, ScoreLivePayload> {
  let state: ScoreboardState = {};
  for (const m of snap.matches) state = applyScoreUpdate(state, m);
  for (const m of Object.values(live)) state = applyScoreUpdate(state, m);
  return new Map(Object.entries(state));
}

function participantIds(m: ScoreLivePayload): string[] {
  return [m.home?.participant_id, m.away?.participant_id].filter(
    (x): x is string => Boolean(x),
  );
}

/** Resultado de grupo (solo partidos terminados cuentan para los puntos). */
function groupResults(matches: ScoreLivePayload[]): GroupMatchResult<string>[] {
  return matches
    .filter((m) => m.status === "finished" && m.home && m.away)
    .map((m) => ({
      home: m.home!.participant_id,
      away: m.away!.participant_id,
      homeGoals: m.home_score,
      awayGoals: m.away_score,
    }));
}

function outcomeFor(
  team: BracketTeam,
  position: number,
  groupsClosed: boolean,
  format: BracketFormat,
): GroupOutcome {
  if (team.eliminated_phase === "group") return "out";
  if (groupsClosed) return "qualifies"; // sobrevivió a la fase de zonas
  if (position <= format.qualifiers_per_zone) return "qualifies"; // heurística en vivo
  if (format.best_thirds > 0 && position === format.qualifiers_per_zone + 1) return "playoff"; // mejores terceros
  return "out";
}

/**
 * Deriva la vista del bracket: grupos rankeados (con "vos" y el desenlace), árbol KO por fase, y
 * tu camino (grupo + próximo rival). `live` es el `ScoreboardState` acumulado de `score:live`.
 */
export function buildBracketView(snap: BracketSnapshot, live: ScoreboardState): BracketView {
  const merged = mergeMatches(snap, live);
  const allMatches = [...merged.values()];
  const me = snap.my_participant_id;
  const teamById = new Map(snap.participants.map((t) => [t.participant_id, t]));
  const groupPhase = allMatches.filter((m) => m.phase === "group");

  // ── Zonas (incluye interzonales: group_letter null, suman para cada lado en su zona) ──
  const letters = [...new Set(snap.participants.map((t) => t.group_letter).filter(Boolean))].sort();
  const groups: GroupView[] = (letters as string[]).map((letter) => {
    const teams = snap.participants.filter((t) => t.group_letter === letter);
    const ids = new Set(teams.map((t) => t.participant_id));
    const matches = groupPhase.filter(
      (m) => m.group_letter === letter || (m.group_letter === null && participantIds(m).some((id) => ids.has(id))),
    );
    const groupsClosed = teams.some((t) => t.eliminated_phase === "group");
    const ranked = rankZone(snap.format.tiebreak, [...ids], groupResults(matches), 0);
    const rows: GroupRow[] = ranked.map((standing, i) => {
      const team = teamById.get(standing.team)!;
      const position = i + 1;
      return {
        team,
        standing,
        position,
        isMe: standing.team === me,
        outcome: outcomeFor(team, position, groupsClosed, snap.format),
      };
    });
    return { letter, rows };
  });

  // ── Eliminación ──
  const ko: KoPhaseView[] = KO_PHASES.map((phase) => ({
    phase,
    matches: allMatches
      .filter((m) => m.phase === phase)
      .sort((a, b) => (a.bracket_slot ?? 0) - (b.bracket_slot ?? 0))
      .map((m) => ({ match: m, isMe: me != null && participantIds(m).includes(me) })),
  })).filter((p) => p.matches.length > 0);

  // ── Tu camino ──
  const myTeam = me ? teamById.get(me) : undefined;
  const phaseIndex = (m: ScoreLivePayload) =>
    m.phase === "group" ? -1 : KO_PHASES.indexOf(m.phase);
  const myNextMatch =
    me == null
      ? null
      : (allMatches
          .filter((m) => participantIds(m).includes(me) && ACTIVE.includes(m.status))
          .sort((a, b) => phaseIndex(a) - phaseIndex(b) || (a.bracket_slot ?? 0) - (b.bracket_slot ?? 0))[0] ?? null);

  const championTeam = snap.champion_participant_id
    ? teamById.get(snap.champion_participant_id)
    : undefined;

  return {
    mode: getMode(snap.mode_id),
    phase: snap.current_phase,
    groups,
    ko,
    myGroupLetter: myTeam?.group_letter ?? null,
    myNextMatch,
    champion: championTeam ?? null,
  };
}
