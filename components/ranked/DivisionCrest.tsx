import { cn } from "@/lib/cn";
import { divisionById } from "@/lib/ranked/types";

/**
 * Escudo de división ranked (`public/crests/div/<id>.svg`, generado por
 * `scripts/brand/build_divisions.py`). `locked` = todavía no alcanzada (gris, apagado).
 */
export function DivisionCrest({
  id,
  locked = false,
  className = "h-10",
}: {
  id: string;
  locked?: boolean;
  className?: string;
}) {
  const div = divisionById(id);
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/crests/div/${div.id}.svg`}
      alt={`División ${div.name}`}
      loading="lazy"
      decoding="async"
      className={cn(
        "aspect-[64/78] w-auto shrink-0 object-contain",
        locked && "opacity-35 grayscale",
        className,
      )}
    />
  );
}
