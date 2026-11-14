import { seasonName } from "@/lib/engine/ranked";
import { divisionById } from "@/lib/ranked/types";
import type { CupCount, ProfileStats } from "@/lib/ranked/types";
import { DivisionCrest } from "@/components/ranked/DivisionCrest";

/**
 * Perfil → Estadísticas, 3 filas:
 *  1. Temporadas ranked: UN escudo por temporada CERRADA (la división en la que terminaste). La temporada
 *     en curso va aparte, marcada "en juego": no es un premio (feedback 14/11).
 *  2. Mundial y 3. Fútbol argentino: copas de oro (campeón), plata (final) y bronce (semis) de torneos
 *     TERMINADOS, una por torneo.
 * Datos: `get_profile_stats()`, que lee solo la tabla `awards`. Presentacional.
 */

const CUPS = [
  { key: "gold", label: "Campeón" },
  { key: "silver", label: "Final" },
  { key: "bronze", label: "Semis" },
] as const;

function RowTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-xs font-bold uppercase tracking-[0.14em] text-fg-muted">{children}</h3>
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
              <span className="text-xs font-bold uppercase tracking-[0.12em] text-fg-muted">{c.label}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function ProfileStatsRows({ stats }: { stats: ProfileStats }) {
  const current = stats.current;
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <RowTitle>Temporadas ranked</RowTitle>
        {current && (
          <div
            className="flex items-center gap-3 rounded-[4px] border border-dashed border-ink px-3 py-2"
            data-testid="season-current"
          >
            <DivisionCrest id={current.division} className="h-10" />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="text-sm font-bold text-fg">{seasonName(current.season_id)} · en juego</span>
              <span className="text-xs text-fg-muted">
                Hoy en {divisionById(current.division).name}. El escudo es el de la división en la que terminés.
              </span>
            </span>
          </div>
        )}
        {stats.seasons.length === 0 ? (
          <p className="text-sm text-fg-muted" data-testid="seasons-empty">
            Todavía no cerraste ninguna temporada.
          </p>
        ) : (
          <ul className="grid grid-cols-3 gap-x-2 gap-y-3" data-testid="seasons">
            {stats.seasons.map((s) => (
              <li key={s.season_id} className="flex flex-col items-center gap-1 text-center">
                <DivisionCrest id={s.division} className="h-12" />
                {/* "LIBERTADORES" no entra en la columna de un teléfono de 360px con tracking: sin tracking
                    hasta 400px y a 11px por debajo de 360px. */}
                <span className="text-xs font-bold uppercase leading-tight tracking-normal text-fg max-[359px]:text-[11px] min-[400px]:tracking-[0.06em]">
                  {divisionById(s.division).name}
                </span>
                <span className="text-xs leading-tight text-fg-muted">{seasonName(s.season_id)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <CupsRow title="Mundial" counts={stats.cups.worldcup} />
      <CupsRow title="Fútbol argentino" counts={stats.cups.arg} />
    </div>
  );
}
