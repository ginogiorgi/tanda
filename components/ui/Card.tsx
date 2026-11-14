import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";

/** Superficie del sistema: hoja de papel con borde de tinta y sombra offset de imprenta.
 * `raised` = recuadro sin sombra para destacar dentro de otra card; `glass` = overlay sobre la
 * escena 3D (papel translúcido); `bare` = sin piel. */
export const cardVariants = cva("text-fg", {
  variants: {
    variant: {
      default: "rounded-[6px] border-2 border-ink bg-bg-elevated shadow-card",
      raised: "rounded-[4px] border border-ink bg-bg-raised",
      glass: "rounded-[6px] border-2 border-ink bg-bg-elevated/85 shadow-card backdrop-blur-sm",
      bare: "rounded-[6px]",
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
