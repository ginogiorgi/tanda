/**
 * Tarjeta de resultado de partido (tarea 7): dos selecciones (código + color de kit), el marcador
 * final y, opcional, el desenlace (Ganaste / Perdiste / Abandonaste). Presentacional y sin estado →
 * la usan tanto el resumen de fin de torneo (`RunSummary`, client) como el historial del perfil
 * (Server Component). Reúsa el diseño de la pantalla de victoria/derrota para todo el historial.
 */

import type { ReactNode } from "react";
import type { HistoryOutcome } from "@/lib/profile/history";

type Team = { code: string | null; kit: string | null; isMe?: boolean };

const OUTCOME: Record<NonNullable<HistoryOutcome>, { label: string; cls: string }> = {
  won: { label: "Ganaste", cls: "bg-success/15 text-success" },
  lost: { label: "Perdiste", cls: "bg-danger/15 text-danger" },
  abandoned: { label: "Abandonaste", cls: "bg-fg-subtle/15 text-fg-muted" },
};

function TeamChip({ code, kit, isMe }: Team) {
  return (
    <span className="flex items-center gap-2">
      <span
        className="h-4 w-4 shrink-0 rounded-full"
        style={{ backgroundColor: kit ?? "#666" }}
        aria-hidden
      />
      <span className={`font-mono text-base font-bold ${isMe ? "text-gold" : "text-fg"}`}>
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
    <div className="w-full rounded-2xl border border-border bg-bg-elevated p-5">
      {caption && (
        <p className="mb-3 text-center text-[11px] font-medium uppercase tracking-wider text-fg-subtle">
          {caption}
        </p>
      )}
      <div className="flex items-center justify-between">
        <TeamChip {...left} />
        <span className="font-mono text-2xl font-extrabold tabular-nums text-fg">
          {`${leftScore ?? "–"}–${rightScore ?? "–"}`}
        </span>
        <TeamChip {...right} />
      </div>
      {children}
      {o && (
        <div className="mt-4 flex justify-center">
          <span
            className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide ${o.cls}`}
          >
            {o.label}
          </span>
        </div>
      )}
    </div>
  );
}
