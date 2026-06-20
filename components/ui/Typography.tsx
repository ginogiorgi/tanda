import { cn } from "@/lib/cn";

/** Etiqueta superior (eyebrow): el `uppercase tracking-[0.2em] text-fg-subtle` repetido en
 * landing, lobby, perfil, reveal, bracket. */
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
        "text-sm font-medium uppercase tracking-[0.25em] text-fg-subtle",
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Título de sección con tick de acento (motivo broadcast). Reemplaza los `<h2>` uppercase. */
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
        "flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-fg-subtle",
        className,
      )}
    >
      {tick && <span aria-hidden className="h-3.5 w-1 rounded-full bg-accent" />}
      {children}
    </h2>
  );
}
