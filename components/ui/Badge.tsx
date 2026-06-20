import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";

/** Pill de estado/etiqueta (fase, EN VIVO, rol, resultado). */
export const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide",
  {
    variants: {
      variant: {
        neutral: "border border-border bg-bg-elevated text-fg-muted",
        gold: "border border-gold/30 bg-gold/15 text-gold-soft",
        accent: "border border-accent/30 bg-accent/15 text-accent",
        blue: "border border-accent-blue/30 bg-accent-blue/15 text-accent-blue",
        success: "border border-success/30 bg-success/15 text-success",
        danger: "border border-danger/30 bg-danger/15 text-danger",
      },
    },
    defaultVariants: { variant: "neutral" },
  },
);

export type BadgeProps = React.HTMLAttributes<HTMLSpanElement> &
  VariantProps<typeof badgeVariants>;

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
