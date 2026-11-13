/**
 * Tarjeta de resultado de partido (tarea 7): dos selecciones (código + color de kit), el marcador
 * final y, opcional, el desenlace (Ganaste / Perdiste / Abandonaste). Presentacional y sin estado →
 * la usan tanto el resumen de fin de torneo (`RunSummary`, client) como el historial del perfil
 * (Server Component). Reúsa el diseño de la pantalla de victoria/derrota para todo el historial.
 */

import type { ReactNode } from "react";
import { TeamMark } from "@/components/common/TeamMark";
import { Badge, type BadgeProps } from "@/components/ui/Badge";
import type { HistoryOutcome } from "@/lib/profile/history";

/** Insignia opcional: bandera (selecciones) o escudo (clubes); sin ninguna → solo kit + código. */
type Team = { code: string | null; kit: string | null; isMe?: boolean; flag?: string | null; crest?: string | null };

const OUTCOME: Record<
  NonNullable<HistoryOutcome>,
  { label: string; variant: BadgeProps["variant"] }
> = {
  won: { label: "Ganaste", variant: "success" },
  lost: { label: "Perdiste", variant: "danger" },
  abandoned: { label: "Abandonaste", variant: "neutral" },
};

function TeamChip({ code, kit, isMe, flag, crest }: Team) {
  return (
    <span className="flex items-center gap-2">
      <TeamMark flag={flag} crest={crest} name={code} className="h-4" />
      <span
        className="h-3.5 w-3.5 shrink-0 rounded-full"
        style={{ backgroundColor: kit ?? "#666" }}
        aria-hidden
      />
      <span className={`font-display text-base font-bold uppercase ${isMe ? "text-gold" : "text-fg"}`}>
        {code ?? "???"}
      </span>
    </span>
  );
}

export function ResultCard({
  caption,
  left,
  right,
  leftScore,
  rightScore,
  outcome,
  children,
}: {
  /** Texto chico arriba (p. ej. la fase: "Final", "Octavos"). */
  caption?: string;
  left: Team;
  right: Team;
  leftScore: number | null;
  rightScore: number | null;
  /** Badge de desenlace; si se omite, no se muestra (p. ej. en RunSummary el header ya lo dice). */
  outcome?: HistoryOutcome;
  /** Contenido extra bajo el marcador (p. ej. el penal-a-penal del resumen). */
  children?: ReactNode;
}) {
  const o = outcome ? OUTCOME[outcome] : null;
  return (
    <div className="w-full rounded-2xl border border-border bg-bg-elevated p-5 shadow-card">
      {caption && (
        <p className="mb-3 text-center text-[11px] font-medium uppercase tracking-wider text-fg-subtle">
          {caption}
        </p>
      )}
      <div className="flex items-center justify-between">
        <TeamChip {...left} />
        <span className="font-display text-3xl font-bold tabular-nums text-fg">
          {`${leftScore ?? "–"}–${rightScore ?? "–"}`}
        </span>
        <TeamChip {...right} />
      </div>
      {children}
      {o && (
        <div className="mt-4 flex justify-center">
          <Badge variant={o.variant}>{o.label}</Badge>
        </div>
      )}
    </div>
  );
}
