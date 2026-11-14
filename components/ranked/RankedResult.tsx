import Link from "next/link";
import { divisionFor } from "@/lib/engine/ranked";
import { signed, type RankedMatchView, type RankedSideResult } from "@/lib/ranked/types";
import { buttonVariants } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Eyebrow } from "@/components/ui/Typography";
import { Confetti } from "@/components/penal/Confetti";
import { DivisionCrest } from "./DivisionCrest";
import { DivisionProgress } from "./DivisionProgress";

/**
 * Cierre de un partido ranked: resultado, puntos (+/−), barra de división y el cartel de
 * ascenso/descenso o escudo. "Otra ranked" re-encola directo. Presentacional (lo arma RankedLive).
 */
export function RankedResult({ view, result }: { view: RankedMatchView; result: RankedSideResult }) {
  const won = view.won === true;
  const div = divisionFor(result.rating);

  return (
    <div className="flex w-full max-w-md flex-col items-center gap-5">
      {(won || result.promoted) && <Confetti />}

      <div className="reveal-pop flex flex-col items-center gap-1 text-center">
        <Eyebrow>Ranked · vs {view.opp.username}</Eyebrow>
        <h1
          className={`font-display text-7xl font-black uppercase leading-[0.85] ${won ? "text-brand" : "text-blue"}`}
        >
          {won ? "Ganaste" : "Perdiste"}
        </h1>
        <span className="font-display text-3xl font-black tabular-nums text-fg">
          {view.my_score} – {view.opp_score}
        </span>
      </div>

      <Card className="flex w-full flex-col items-center gap-4">
        <div className="flex flex-col items-center">
          <span
            className={`reveal-pop font-display text-6xl font-black leading-none tabular-nums ${
              result.delta >= 0 ? "text-success" : "text-brand-ink"
            }`}
          >
            {signed(result.delta)}
          </span>
          <span className="text-xs font-bold uppercase tracking-[0.14em] text-fg-muted">
            puntos de liga · <span className="font-mono">{view.me.rating}</span> →{" "}
            <span className="font-mono">{result.rating}</span>
          </span>
        </div>

        <DivisionProgress rating={result.rating} shield={result.shield} />

        {result.promoted && (
          <div className="reveal-pop flex w-full items-center gap-3 border-2 border-ink bg-ink p-3 text-bg">
            <DivisionCrest id={div.id} className="h-16" />
            <div className="flex flex-col">
              <span className="font-display text-3xl font-black uppercase leading-none">¡Ascendiste!</span>
              <span className="text-xs font-semibold opacity-80">
                Bienvenido a {div.name}. Tenés escudo: 3 derrotas sin descender.
              </span>
            </div>
          </div>
        )}
        {result.demoted && (
          <div className="flex w-full items-center gap-3 border-2 border-ink p-3">
            <DivisionCrest id={div.id} className="h-12" />
            <span className="text-sm font-semibold text-fg">Descendiste a {div.name}. A recuperarlo.</span>
          </div>
        )}
        {result.shield_saved && (
          <p className="w-full border-2 border-dashed border-ink p-3 text-center text-sm font-semibold text-fg">
            🛡️ El escudo te salvó del descenso
            {result.shield > 0 ? ` (te quedan ${result.shield})` : " (era el último)"}.
          </p>
        )}
      </Card>

      <div className="flex w-full flex-col gap-3">
        <Link href="/ranked" className={buttonVariants({ variant: "primary", size: "lg", block: true })}>
          Otra ranked
        </Link>
        {/* La tabla vive en el perfil (mapa de pantallas, feedback 14/11): acá solo seguir o salir. */}
        <Link href="/" className={buttonVariants({ variant: "outline", block: true })}>
          Inicio
        </Link>
      </div>
    </div>
  );
}
