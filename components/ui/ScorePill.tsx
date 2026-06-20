import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";

/** Dígito de marcador estilo tablero de transmisión: fuente display condensada + tabular-nums. */
export const scorePillVariants = cva(
  "inline-flex items-center justify-center rounded-lg font-display font-bold leading-none tabular-nums",
  {
    variants: {
      tone: {
        neutral: "border border-ring bg-bg-raised text-fg",
        accent: "bg-accent-grad text-bg shadow-[0_8px_24px_-14px_var(--accent)]",
        gold: "bg-gold-grad text-bg shadow-[0_8px_24px_-14px_var(--gold)]",
        muted: "border border-border bg-bg-elevated text-fg-muted",
      },
      size: {
        sm: "h-8 min-w-[2ch] px-2 text-xl",
        md: "h-11 min-w-[2.2ch] px-2.5 text-3xl",
        lg: "h-16 min-w-[2.4ch] px-3 text-5xl",
      },
    },
    defaultVariants: { tone: "neutral", size: "md" },
  },
);

export type ScorePillProps = React.HTMLAttributes<HTMLSpanElement> &
  VariantProps<typeof scorePillVariants>;

export function ScorePill({ className, tone, size, ...props }: ScorePillProps) {
  return <span className={cn(scorePillVariants({ tone, size }), className)} {...props} />;
}
