/**
 * HUD de la tanda (8.10), montado sobre la tarjeta de penal: marcador en vivo (con nación + color
 * de kit), "Penal N de 5" (o muerte súbita) y si en este penal PATEÁS o ATAJÁS. La opción elegida
 * se resalta en la propia tarjeta de `<PenalLive>`. Presentacional.
 */

import { kitSwatchStyle, type ParticipantBrief } from "@/lib/realtime/score";
import { TeamMark } from "@/components/common/TeamMark";
import { Badge } from "@/components/ui/Badge";
import { ScorePill } from "@/components/ui/ScorePill";
import { PenaltyDots } from "@/components/penal/PenaltyDots";
import { penaltyBoard, type DotState } from "@/lib/penal/dots";

/** Un penal ya resuelto: su idx global (impar = patea home, par = away) y si el pateador convirtió. */
export type PenalDot = { idx: number; scored: boolean };

function Side({
  brief,
  score,
  states,
  align,
}: {
  brief: ParticipantBrief | null;
  score: number;
  states: DotState[];
  align: "left" | "right";
}) {
  return (
    <div className={`flex flex-1 flex-col gap-1 ${align === "right" ? "items-end" : "items-start"}`}>
      <div className={`flex items-center gap-2 ${align === "right" ? "flex-row-reverse" : ""}`}>
        <TeamMark flag={brief?.flag} crest={brief?.crest} name={brief?.team_name} className="h-4" />
        <span
          className="h-3 w-3 shrink-0 rounded-full ring-1 ring-ink"
          style={kitSwatchStyle(brief)}
          aria-hidden
        />
        <span className="font-display text-lg font-extrabold uppercase leading-none tracking-[0.04em] text-fg">
          {brief?.team_code ?? "???"}
        </span>
        <ScorePill tone="neutral" size="sm">
          {score}
        </ScorePill>
      </div>
      <PenaltyDots states={states} team={brief?.team_name ?? "???"} align={align} />
    </div>
  );
}

interface PenalHudProps {
  home: ParticipantBrief | null;
  away: ParticipantBrief | null;
  homeScore: number;
  awayScore: number;
  /** idx global del penal (home impar, away par; >10 = muerte súbita). */
  idx: number;
  /** "kick" si el caller patea este penal, "keep" si ataja, null si solo mira. */
  role: "kick" | "keep" | null;
  /** Penales ya resueltos del match (10.12): tablero de círculos verde/rojo por lado. */
  dots: PenalDot[];
  /** Penales por lado en esta fase (3 grupos / 5 eliminación) → "Penal N de M". */
  kicksPerSide: number;
  /** T3: si el caller es el participante `away`, invertir los lados para que su país quede siempre
   *  a la izquierda. Solo orden visual; la asignación de penales (paridad) no cambia. */
  flip?: boolean;
}

export function PenalHud({
  home,
  away,
  homeScore,
  awayScore,
  idx,
  role,
  dots,
  kicksPerSide,
  flip = false,
}: PenalHudProps) {
  const suddenDeath = idx > kicksPerSide * 2;
  const label = suddenDeath ? "Muerte súbita" : `Penal ${Math.ceil(idx / 2)} de ${kicksPerSide}`;
  // impar = patea home, par = away (mismo criterio que engine_advance_match).
  // Tablero (P5): todos los slots desde el arranque; se pinta cada uno al resolverse su penal.
  const kicks = (odd: boolean) =>
    dots
      .filter((d) => d.idx % 2 === (odd ? 1 : 0))
      .sort((a, b) => a.idx - b.idx)
      .map((d) => d.scored);
  const board = penaltyBoard(kicks(true), kicks(false), kicksPerSide);
  const homeDots = board.home;
  const awayDots = board.away;

  // T3: el lado izquierdo es siempre el del caller. Si patea/ataja como away, se invierten brief,
  // score y dots de cada lado (la paridad de cada penal sigue siendo home=impar / away=par).
  const left = flip
    ? { brief: away, score: awayScore, dots: awayDots }
    : { brief: home, score: homeScore, dots: homeDots };
  const right = flip
    ? { brief: home, score: homeScore, dots: homeDots }
    : { brief: away, score: awayScore, dots: awayDots };

  return (
    <div className="flex w-full flex-col items-center gap-2">
      <div className="flex w-full items-start gap-3 border-t-[3px] border-b border-ink py-2">
        <Side brief={left.brief} score={left.score} states={left.dots} align="left" />
        {/* 10px a propósito: a 12px "PENAL 3 DE 5" no entra entre los dos lados en 375px. */}
        <span className="mt-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-fg-muted">
          {label}
        </span>
        <Side brief={right.brief} score={right.score} states={right.dots} align="right" />
      </div>
      {role && (
        <Badge variant={role === "kick" ? "brand" : "blue"}>
          {role === "kick" ? "⚽ Pateás" : "🧤 Atajás"}
        </Badge>
      )}
    </div>
  );
}
