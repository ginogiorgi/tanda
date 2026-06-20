"use client";

/**
 * HUD de la tanda (8.10), montado sobre la tarjeta de penal: marcador en vivo (con nación + color
 * de kit), "Penal N de 5" (o muerte súbita) y si en este penal PATEÁS o ATAJÁS. La opción elegida
 * se resalta en la propia tarjeta de `<PenalLive>`. Presentacional.
 */

import { kitSwatchStyle, type ParticipantBrief } from "@/lib/realtime/score";
import { Flag } from "@/components/common/Flag";
import { Badge } from "@/components/ui/Badge";
import { ScorePill } from "@/components/ui/ScorePill";

/** Un penal ya resuelto: su idx global (impar = patea home, par = away) y si el pateador convirtió. */
export type PenalDot = { idx: number; scored: boolean };

/** Tablero estilo transmisión (10.12): un círculo por penal pateado por este lado — verde gol, rojo erró. */
function Dots({ dots, align }: { dots: PenalDot[]; align: "left" | "right" }) {
  return (
    <span className={`flex flex-wrap gap-1 ${align === "right" ? "justify-end" : ""}`}>
      {dots.length === 0 ? (
        <span className="text-[10px] text-fg-subtle">—</span>
      ) : (
        dots.map((d) => (
          <span
            key={d.idx}
            title={`Penal ${d.idx}`}
            className={`h-2.5 w-2.5 rounded-full ${d.scored ? "bg-success" : "bg-danger/70"}`}
          />
        ))
      )}
    </span>
  );
}

function Side({
  brief,
  score,
  dots,
  align,
}: {
  brief: ParticipantBrief | null;
  score: number;
  dots: PenalDot[];
  align: "left" | "right";
}) {
  return (
    <div className={`flex flex-1 flex-col gap-1 ${align === "right" ? "items-end" : "items-start"}`}>
      <div className={`flex items-center gap-2 ${align === "right" ? "flex-row-reverse" : ""}`}>
        <Flag code={brief?.flag} name={brief?.nation_name} className="h-4" />
        <span
          className="h-3 w-3 shrink-0 rounded-full"
          style={kitSwatchStyle(brief)}
          aria-hidden
        />
        <span className="font-display text-sm font-bold uppercase text-fg">
          {brief?.nation_code ?? "???"}
        </span>
        <ScorePill tone="neutral" size="sm">
          {score}
        </ScorePill>
      </div>
      <Dots dots={dots} align={align} />
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
}: PenalHudProps) {
  const suddenDeath = idx > kicksPerSide * 2;
  const label = suddenDeath ? "Muerte súbita" : `Penal ${Math.ceil(idx / 2)} de ${kicksPerSide}`;
  // impar = patea home, par = away (mismo criterio que engine_advance_match).
  const homeDots = dots.filter((d) => d.idx % 2 === 1);
  const awayDots = dots.filter((d) => d.idx % 2 === 0);

  return (
    <div className="flex w-full flex-col items-center gap-2">
      <div className="flex w-full items-start gap-3">
        <Side brief={home} score={homeScore} dots={homeDots} align="left" />
        <span className="mt-1 text-[10px] font-semibold uppercase tracking-wider text-fg-subtle">
          {label}
        </span>
        <Side brief={away} score={awayScore} dots={awayDots} align="right" />
      </div>
      {role && (
        <Badge variant={role === "kick" ? "gold" : "blue"}>
          {role === "kick" ? "⚽ Pateás" : "🧤 Atajás"}
        </Badge>
      )}
    </div>
  );
}
