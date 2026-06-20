import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";

/** Superficie elevada del sistema (cards, paneles, shells). Reemplaza el `rounded-2xl border…`
 * copypasteado. `glass` para overlays del HUD; `raised` para destacar dentro de otra card. */
export const cardVariants = cva("text-fg", {
  variants: {
    variant: {
      default: "rounded-2xl border border-border bg-bg-elevated shadow-card",
      raised: "rounded-2xl border border-ring bg-bg-raised shadow-card",
      glass:
        "rounded-2xl border border-white/10 bg-bg-elevated/60 shadow-card backdrop-blur-md",
      bare: "rounded-2xl",
    },
    padding: { none: "", sm: "p-4", md: "p-5", lg: "p-6" },
  },
  defaultVariants: { variant: "default", padding: "md" },
});

export type CardProps = React.HTMLAttributes<HTMLDivElement> &
  VariantProps<typeof cardVariants>;

export function Card({ className, variant, padding, ...props }: CardProps) {
  return <div className={cn(cardVariants({ variant, padding }), className)} {...props} />;
}
