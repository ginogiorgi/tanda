import { boardLabel, type DotState } from "@/lib/penal/dots";
import { cn } from "@/lib/cn";

/**
 * Un lado del tablero de penales (feedback 2, P5): slots pendientes con contorno de tinta y, al
 * resolverse, verde (gol) o rojo (errado) con un "pop" de imprenta. Lo usan el HUD del penal y el
 * resumen; los estados salen de `penaltyBoard` (lib/penal/dots).
 */
const STATE: Record<DotState, string> = {
  pending: "border-ink/60 bg-transparent",
  scored: "dot-pop border-success bg-success",
  missed: "dot-pop border-danger bg-danger",
};

export function PenaltyDots({
  states,
  team,
  align = "left",
  size = "sm",
}: {
  states: readonly DotState[];
  team: string;
  align?: "left" | "right";
  size?: "sm" | "md";
}) {
  return (
    <span
      role="img"
      aria-label={boardLabel(team, states)}
      data-testid="penalty-dots"
      className={cn("flex flex-wrap gap-1", align === "right" && "justify-end")}
    >
      {states.map((s, i) => (
        <span
          key={i}
          data-dot={s}
          className={cn("rounded-full border-2", size === "sm" ? "size-2.5" : "size-3", STATE[s])}
        />
      ))}
    </span>
  );
}
