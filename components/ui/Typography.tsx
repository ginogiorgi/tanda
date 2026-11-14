import { cn } from "@/lib/cn";

/** Etiqueta superior (eyebrow) estilo "volanta" de revista: versalitas rojas. */
export function Eyebrow({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "text-xs font-bold uppercase tracking-[0.2em] text-brand-ink",
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Título de sección con filete de tinta arriba (motivo de programa impreso). */
export function SectionTitle({
  className,
  children,
  tick = true,
}: {
  className?: string;
  children: React.ReactNode;
  tick?: boolean;
}) {
  return (
    <h2
      className={cn(
        "flex items-center gap-2 border-t-[3px] border-ink pt-1.5 font-display text-lg font-extrabold uppercase tracking-[0.04em] text-fg",
        className,
      )}
    >
      {tick && <span aria-hidden className="h-2.5 w-2.5 rounded-full bg-brand" />}
      {children}
    </h2>
  );
}
