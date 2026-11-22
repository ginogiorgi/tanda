import { TeamMark } from "@/components/common/TeamMark";
import { Card } from "@/components/ui/Card";
import { ExpandableList } from "@/components/ui/ExpandableList";
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
 * Un ranking de hinchas (países o clubes): top 10 a la vista, el resto se despliega en la misma lista con
 * el botón al final, y tu favorito marcado — si está fuera del top, se agrega abajo del top (solo plegado:
 * desplegado ya aparece en su puesto).
 */
export function FanRankingList({ title, rows, mine }: { title: string; rows: FanRow[]; mine: string | null }) {
  const top = rows.slice(0, TOP);
  const rest = rows.slice(TOP);
  const mineRow = mine ? rest.find((r) => r.code === mine) : undefined;
  const head = top.map((r) => <Row key={r.code} r={r} mine={r.code === mine} />);
  return (
    <Card padding="none" className="flex flex-col overflow-hidden">
      <h3 className="border-b-2 border-ink px-3 py-2 font-display text-2xl font-black uppercase">{title}</h3>
      {rest.length === 0 ? (
        <ol>{head}</ol>
      ) : (
        <ExpandableList
          head={head}
          rest={rest.map((r) => (
            <Row key={r.code} r={r} mine={r.code === mine} />
          ))}
          collapsedTail={
            mineRow && (
              <>
                <li aria-hidden className="border-b border-border px-3 text-center text-fg-subtle">
                  ⋯
                </li>
                <Row r={mineRow} mine />
              </>
            )
          }
          moreLabel={`Ver los ${rows.length}`}
        />
      )}
    </Card>
  );
}
