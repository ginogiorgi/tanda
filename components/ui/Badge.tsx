import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";

/** Pill de estado/etiqueta (fase, EN VIVO, rol, resultado). */
export const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-[3px] border-[1.5px] px-2 py-0.5 text-xs font-bold uppercase tracking-[0.12em]",
  {
    variants: {
      variant: {
        neutral: "border-ink bg-bg-elevated text-fg",
        brand: "border-brand bg-brand text-on-fill",
        accent: "border-ink bg-accent text-on-fill",
        blue: "border-blue bg-blue text-on-fill",
        success: "border-success bg-success text-on-fill",
        danger: "border-ink bg-ink text-bg",
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
