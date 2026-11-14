import { DIVISIONS, seasonName } from "@/lib/engine/ranked";
import type { CupCount, ProfileStats } from "@/lib/ranked/types";
import { DivisionCrest } from "@/components/ranked/DivisionCrest";

/**
 * Perfil → Estadísticas (pedido de Gino), 3 filas:
 *  1. Divisiones ranked: los 6 escudos; los alcanzados a color con la 1ª temporada en que se logró.
 *  2. Mundial y 3. Fútbol argentino: copas de oro (campeón), plata (final) y bronce (semis) con su conteo.
 * Datos: `get_profile_stats()`. Presentacional.
 */

const CUPS = [
  { key: "gold", label: "Campeón" },
  { key: "silver", label: "Final" },
  { key: "bronze", label: "Semis" },
] as const;

function RowTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-[0.7rem] font-bold uppercase tracking-[0.14em] text-fg-muted">{children}</h3>
  );
}

function CupsRow({ title, counts }: { title: string; counts: CupCount | undefined }) {
  return (
    <div className="flex flex-col gap-2">
      <RowTitle>{title}</RowTitle>
      <ul className="grid grid-cols-3 gap-2">
        {CUPS.map((c) => {
          const n = counts?.[c.key] ?? 0;
          return (
            <li
              key={c.key}
              className="flex flex-col items-center gap-1 rounded-[4px] border border-ink bg-bg-raised px-2 py-3"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/cups/${c.key}.svg`}
                alt=""
                loading="lazy"
                decoding="async"
                className={`aspect-[48/56] h-10 w-auto ${n === 0 ? "opacity-30 grayscale" : ""}`}
              />
              <span className="font-display text-3xl font-black leading-none tabular-nums text-fg">{n}</span>
              <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-fg-muted">{c.label}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function ProfileStatsRows({ stats }: { stats: ProfileStats }) {
  const seasonOf = new Map(stats.divisions.map((d) => [d.id, d.season_id]));
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <RowTitle>Divisiones ranked</RowTitle>
        <ul className="grid grid-cols-3 gap-x-2 gap-y-3">
          {DIVISIONS.map((d) => {
            const season = seasonOf.get(d.id) ?? null;
            return (
              <li key={d.id} className="flex flex-col items-center gap-1 text-center">
                <DivisionCrest id={d.id} locked={season === null} className="h-12" />
                <span className="text-[10px] font-bold uppercase leading-tight tracking-[0.06em] text-fg">
                  {d.name}
                </span>
                <span className="text-[10px] leading-tight text-fg-muted">
                  {season ? seasonName(season) : "—"}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
      <CupsRow title="Mundial" counts={stats.cups.worldcup} />
      <CupsRow title="Fútbol argentino" counts={stats.cups.arg} />
    </div>
  );
}
