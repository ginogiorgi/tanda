import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { SectionTitle } from "@/components/ui/Typography";
import { buttonVariants } from "@/components/ui/Button";
import { DivisionProgress } from "@/components/ranked/DivisionProgress";
import type { RankedMe } from "@/lib/ranked/types";

/**
 * Ficha de liga del perfil (feedback 14/11): división, puntos, POSICIÓN en la tabla de la temporada y
 * el camino a la tabla. La tabla cuelga del perfil en el mapa de pantallas (`lib/nav/routes.ts`).
 * Presentacional → Server Component.
 */
export function LeagueCard({ ranked }: { ranked: RankedMe }) {
  return (
    <Card className="flex flex-col gap-4">
      <SectionTitle>Liga</SectionTitle>
      <DivisionProgress rating={ranked.rating} shield={ranked.shield} compact />
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-fg" data-testid="ranked-position">
          {ranked.position != null ? (
            <>
              Posición <span className="font-mono text-lg font-bold">#{ranked.position}</span> en la temporada
            </>
          ) : (
            <span className="text-fg-muted">Jugá una ranked para entrar en la tabla</span>
          )}
        </p>
        <Link href="/ranking" className={buttonVariants({ variant: "outline", size: "sm", className: "shrink-0" })}>
          Ver tabla
        </Link>
      </div>
    </Card>
  );
}
