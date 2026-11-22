import { cn } from "@/lib/cn";

/**
 * Cartel del resultado del penal (§8.11): GOL/ATAJADO, el marcador y la correcta. Feedback 4 #11: el cuerpo es
 * PAPEL TRANSLÚCIDO al 70 % con la trama, sin blur (la marca prohíbe glass): el arco y el arquero se ven a través
 * mientras corre el festejo. Lo grande (marcador, GOL/ATAJADO) va en tinta llena y se lee sobre cualquier fondo;
 * la correcta (texto chico, verde/rojo) va en un TALÓN de papel opaco al pie, porque sobre papel translúcido su
 * contraste dependía de la escena (no llegaba a AA sobre el pasto). Elegido con capturas de 70/80/88/100 sobre
 * gol y atajada (`/dev/penal?card=…`, `e2e/shots/penal.spec.ts`).
 * Presentacional: lo usan `PenalLive` y el harness de dev.
 */
export function PenaltyResultBalloon({
  idx,
  homeScore,
  awayScore,
  scored,
  note,
  correctText,
  answeredRight,
  className,
}: {
  idx: number;
  homeScore: number;
  awayScore: number;
  scored: boolean;
  /** Motivo cuando se decidió por velocidad (10.7); null = no se muestra. */
  note: string | null;
  correctText: string;
  /** El jugador eligió la correcta → verde; si erró o no respondió → rojo. */
  answeredRight: boolean;
  /** Solo para comparar variantes en dev (p. ej. otra opacidad de papel). */
  className?: string;
}) {
  return (
    <div
      data-testid="penal-result-card"
      className="fade-in absolute left-1/2 top-16 z-10 flex w-full max-w-sm -translate-x-1/2 flex-col items-center px-6 text-center md:top-[6%]"
    >
      <div
        className={cn(
          "flex w-full flex-col items-center gap-2 overflow-hidden rounded-[6px] border-2 border-ink bg-bg-elevated/70 bg-halftone pt-3 shadow-pop",
          className,
        )}
      >
        <span className="px-4 text-xs font-bold uppercase tracking-[0.2em] text-fg">
          Penal {idx} · <span className="font-mono">{homeScore}–{awayScore}</span>
        </span>
        <p className={`px-4 font-display text-6xl font-black uppercase leading-[0.85] ${scored ? "text-brand" : "text-blue"}`}>
          {scored ? "¡GOL!" : "ATAJADO"}
        </p>
        {/* Talón opaco: el texto chico no depende de lo que se ve detrás. */}
        <div className="mt-1 flex w-full flex-col gap-1 border-t-2 border-ink bg-bg-elevated px-4 py-2">
          {note && <p className="text-sm font-semibold text-fg">{note}</p>}
          {/* T4: solo la correcta, en verde si acertaste, rojo si erraste (o no respondiste). */}
          <p className={`text-base font-bold ${answeredRight ? "text-success" : "text-brand-ink"}`}>
            Correcta: {correctText}
          </p>
        </div>
      </div>
    </div>
  );
}
