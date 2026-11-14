import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";

/** Dígito de marcador de tablero impreso: Big Shoulders + tabular-nums, recuadro de tinta. */
export const scorePillVariants = cva(
  "inline-flex items-center justify-center rounded-[4px] font-display font-black leading-none tabular-nums",
  {
    variants: {
      tone: {
        neutral: "border-2 border-ink bg-bg-raised text-fg",
        accent: "border-2 border-ink bg-accent text-white",
        brand: "border-2 border-ink bg-brand text-white",
        muted: "border-2 border-border bg-bg-elevated text-fg-muted",
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
