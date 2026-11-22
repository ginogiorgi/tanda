import { ladder } from "@/lib/engine/ranked";
import { DivisionCrest } from "./DivisionCrest";

/**
 * Escalera de liga (feedback 4 #7): escudo de la división de abajo → barra de avance → escudo de la de
 * arriba, con las zonas de descenso/ascenso marcadas en los extremos de la barra y una línea de estado.
 * Va ADENTRO de la tarjeta-botón de Ranked → solo contenido de frase (`span`), colores con `currentColor`
 * para servir sobre tinta (reposo) y sobre papel (hover). Presentacional → Server Component.
 */
export function LeagueLadder({
  rating,
  shield,
  position,
  id,
}: {
  rating: number;
  shield: number;
  position: number | null;
  /** id del resumen textual (la tarjeta lo usa como `aria-describedby`). */
  id: string;
}) {
  const l = ladder(rating, shield);
  const pct = Math.round(l.fraction * 100);
  return (
    <span className="flex w-full flex-col gap-1.5">
      <span className="flex items-center gap-2" aria-hidden>
        {l.prev ? (
          <DivisionCrest id={l.prev.id} locked className="h-7" />
        ) : (
          <span className="h-7 w-[1.4rem] shrink-0" />
        )}
        <span className="relative h-3 min-w-0 flex-1 overflow-hidden border-2 border-current">
          {/* Relleno en currentColor (papel sobre tinta, tinta sobre papel); las zonas van ENCIMA, rayadas,
              así se leen también sobre la parte llena: descenso al comienzo, ascenso al final. */}
          <span className="block h-full bg-current" style={{ width: `${pct}%` }} />
          {l.relegationZone && (
            <span data-zone="relegation" className="absolute inset-y-0 left-0 w-1/5 bg-stripes-danger" />
          )}
          {l.promotionZone && (
            <span data-zone="promotion" className="absolute inset-y-0 right-0 w-1/5 bg-stripes-success" />
          )}
        </span>
        {l.next ? (
          <DivisionCrest id={l.next.id} locked className="h-7" />
        ) : (
          <span className="h-7 w-[1.4rem] shrink-0" />
        )}
      </span>
      <span className="flex items-baseline justify-between gap-2 text-[0.7rem] font-semibold uppercase tracking-[0.06em] opacity-75">
        <span>{l.prev?.name ?? ""}</span>
        <span>{l.next?.name ?? "División máxima"}</span>
      </span>
      <span id={id} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-semibold leading-snug">
        <span>{l.next ? `→ ${l.next.name} en ${l.toNext}` : "Estás en la cima"}</span>
        {position != null ? (
          <span data-testid="ranked-position">· #{position} de la temporada</span>
        ) : (
          <span className="opacity-75">· Jugá una para entrar en la tabla</span>
        )}
        {shield > 0 && <span>· Escudo {shield}/3</span>}
        {l.promotionZone && (
          <span className="rounded-[3px] bg-success px-1.5 py-0.5 text-[0.65rem] font-bold uppercase text-on-fill">
            Zona de ascenso
          </span>
        )}
        {l.relegationZone && (
          <span className="rounded-[3px] bg-danger px-1.5 py-0.5 text-[0.65rem] font-bold uppercase text-on-fill">
            Zona de descenso
          </span>
        )}
        <span className="sr-only">{`Avance en ${l.division.name}: ${pct}%.`}</span>
      </span>
    </span>
  );
}
