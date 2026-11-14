import { cn } from "@/lib/cn";

/**
 * Wordmark de Tanda (rebrand "B · Programa"): TANDA en Big Shoulders Black, tinta, con el sello
 * rojo de imprenta "TA · 26" girado (motivo de programa de cancha / sello de entrada). El tamaño lo
 * define el `font-size` del contenedor (`className`), el sello escala en `em`.
 * Presentacional → Server Component.
 */
export function Wordmark({ className, stamp = true }: { className?: string; stamp?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-[0.12em] font-display font-black uppercase leading-[0.8] tracking-[0.01em] text-fg",
        className,
      )}
    >
      <span>Tanda</span>
      {stamp && (
        // El aro se dimensiona en `em` del wordmark; el texto va en un hijo con font-size propio
        // (si no, el `em` del aro se achicaría junto con la letra).
        <span
          aria-hidden
          className="grid size-[0.62em] shrink-0 -rotate-12 place-items-center rounded-full border-[0.05em] border-brand text-brand"
        >
          <span className="text-center text-[0.24em] leading-[0.92]">
            TA
            <br />
            26
          </span>
        </span>
      )}
    </span>
  );
}
