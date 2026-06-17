"use client";

/**
 * HUD de la tanda (8.10), montado sobre la tarjeta de penal: marcador en vivo (con nación + color
 * de kit), "Penal N de 5" (o muerte súbita) y si en este penal PATEÁS o ATAJÁS. La opción elegida
 * se resalta en la propia tarjeta de `<PenalLive>`. Presentacional.
 */

import type { ParticipantBrief } from "@/lib/realtime/score";

function Side({ brief, score, align }: { brief: ParticipantBrief | null; score: number; align: "left" | "right" }) {
  return (
    <div className={`flex flex-1 items-center gap-2 ${align === "right" ? "flex-row-reverse" : ""}`}>
      <span
        className="h-4 w-4 shrink-0 rounded-full"
        style={{ backgroundColor: brief?.kit_primary ?? "#666" }}
        aria-hidden
      />
      <span className="font-mono text-sm font-semibold text-fg">{brief?.nation_code ?? "???"}</span>
      <span className="font-mono text-xl font-extrabold tabular-nums text-fg">{score}</span>
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
}

export function PenalHud({ home, away, homeScore, awayScore, idx, role }: PenalHudProps) {
  const suddenDeath = idx > 10;
  const label = suddenDeath ? "Muerte súbita" : `Penal ${Math.ceil(idx / 2)} de 5`;

  return (
    <div className="flex w-full flex-col items-center gap-2">
      <div className="flex w-full items-center gap-3">
        <Side brief={home} score={homeScore} align="left" />
        <span className="text-[10px] font-semibold uppercase tracking-wider text-fg-subtle">
          {label}
        </span>
        <Side brief={away} score={awayScore} align="right" />
      </div>
      {role && (
        <span
          className={`rounded-full px-3 py-0.5 text-[11px] font-bold uppercase tracking-wider ${
            role === "kick" ? "bg-gold/20 text-gold" : "bg-accent-blue/20 text-accent-blue"
          }`}
        >
          {role === "kick" ? "⚽ Pateás" : "🧤 Atajás"}
        </span>
      )}
    </div>
  );
}
