import { cn } from "@/lib/cn";
import { Card } from "./Card";

/** Tarjeta de estadística (valor display grande + label). Extraída de `app/perfil/page.tsx`. */
export function StatCard({
  label,
  value,
  className,
}: {
  label: string;
  value: string | number;
  className?: string;
}) {
  return (
    <Card variant="raised" padding="none" className={cn("flex flex-col gap-1 px-4 py-3", className)}>
      <span className="font-display text-4xl font-black tabular-nums text-fg">
        {value}
      </span>
      <span className="text-xs font-bold uppercase tracking-[0.12em] text-fg-muted">{label}</span>
    </Card>
  );
}
