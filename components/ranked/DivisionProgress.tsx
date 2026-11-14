import { progressToNext } from "@/lib/engine/ranked";
import { DivisionCrest } from "./DivisionCrest";

/**
 * Ficha de liga: escudo + división + puntos y la barra hacia la próxima ("→ Primera en 16").
 * Barra de imprenta (marco de tinta) como `TimeBar`. Presentacional.
 */
export function DivisionProgress({
  rating,
  shield = 0,
  compact = false,
}: {
  rating: number;
  shield?: number;
  compact?: boolean;
}) {
  const p = progressToNext(rating);
  return (
    <div className="flex w-full items-center gap-3">
      <DivisionCrest id={p.division.id} className={compact ? "h-10" : "h-14"} />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex items-baseline justify-between gap-2">
          <span className="font-display text-2xl font-black uppercase leading-none text-fg">
            {p.division.name}
          </span>
          <span className="font-mono text-sm font-bold text-fg">{rating} pts</span>
        </div>
        <div
          className="h-2.5 w-full overflow-hidden border-2 border-ink bg-bg-raised"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(p.fraction * 100)}
          aria-label={p.next ? `Progreso a ${p.next.name}` : "División máxima"}
        >
          <div className="h-full bg-brand" style={{ width: `${p.fraction * 100}%` }} />
        </div>
        <span className="text-xs font-semibold text-fg-muted">
          {p.next ? `→ ${p.next.name} en ${p.toNext}` : "División máxima"}
          {shield > 0 && ` · Escudo ${shield}/3`}
        </span>
      </div>
    </div>
  );
}
