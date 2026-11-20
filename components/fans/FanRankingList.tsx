import { TeamMark } from "@/components/common/TeamMark";
import { Card } from "@/components/ui/Card";
import type { FanRow } from "@/lib/fans/catalog";
import { cn } from "@/lib/cn";

const TOP = 10;

function Row({ r, mine }: { r: FanRow; mine: boolean }) {
  return (
    <li
      aria-current={mine ? "true" : undefined}
      className={cn(
        "grid grid-cols-[2rem_2rem_1fr_auto] items-center gap-2 border-b border-border px-3 py-2 last:border-b-0",
        mine && "bg-ink text-bg",
      )}
    >
      <span className="font-display text-xl font-black tabular-nums">{r.pos}</span>
      <TeamMark flag={r.flag} crest={r.crest} name={r.name} className="h-6" />
      <span className="truncate text-sm font-bold">
        {r.name}
        {mine && <span className="sr-only"> (tu favorito)</span>}
      </span>
      <span className="font-mono text-base font-bold">
        {r.fans}{" "}
        <span className={cn("text-xs font-semibold", mine ? "opacity-75" : "text-fg-muted")}>
          {r.fans === 1 ? "hincha" : "hinchas"}
        </span>
      </span>
    </li>
  );
}

/**
 * Un ranking de hinchas (países o clubes): top 10 a la vista, el resto plegado (`<details>`, sin JS) y tu
 * favorito marcado — si está fuera del top, se agrega abajo del top para que siempre lo veas.
 */
export function FanRankingList({ title, rows, mine }: { title: string; rows: FanRow[]; mine: string | null }) {
  const top = rows.slice(0, TOP);
  const rest = rows.slice(TOP);
  const mineRow = mine ? rest.find((r) => r.code === mine) : undefined;
  return (
    <Card padding="none" className="flex flex-col overflow-hidden">
      <h3 className="border-b-2 border-ink px-3 py-2 font-display text-2xl font-black uppercase">{title}</h3>
      <ol>
        {top.map((r) => (
          <Row key={r.code} r={r} mine={r.code === mine} />
        ))}
        {mineRow && (
          <>
            <li aria-hidden className="border-b border-border px-3 text-center text-fg-subtle">
              ⋯
            </li>
            <Row r={mineRow} mine />
          </>
        )}
      </ol>
      {rest.length > 0 && (
        <details className="group border-t-2 border-ink">
          <summary className="cursor-pointer list-none px-3 py-2 text-center text-sm font-bold uppercase tracking-[0.08em] text-fg-muted hover:text-fg">
            <span className="group-open:hidden">Ver los {rows.length}</span>
            <span className="hidden group-open:inline">Ver menos</span>
          </summary>
          <ol>
            {rest.map((r) => (
              <Row key={r.code} r={r} mine={r.code === mine} />
            ))}
          </ol>
        </details>
      )}
    </Card>
  );
}
