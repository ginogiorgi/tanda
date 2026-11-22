import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";

/**
 * Botón "programa de partido": borde de tinta de 2px, sombra offset dura que se "imprime" al
 * apretar (el botón baja 2px y la sombra se achica), etiqueta en Big Shoulders mayúscula. `buttonVariants()` se exporta aparte para vestir `<Link>` con el mismo
 * look sin duplicar strings (los CTAs de navegación son links, no `<button>`).
 */
/** Borde + sombra de imprenta y el "apretón" (baja 2px, la sombra se achica). */
const PRINTED =
  "border-2 border-ink shadow-card motion-safe:active:translate-x-[2px] motion-safe:active:translate-y-[2px] active:shadow-press";

export const buttonVariants = cva(
  "inline-flex select-none items-center justify-center gap-2 rounded-[4px] font-display font-extrabold uppercase tracking-[0.06em] transition-[transform,box-shadow,background-color,border-color,color,opacity] duration-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue focus-visible:ring-offset-2 focus-visible:ring-offset-bg disabled:pointer-events-none disabled:opacity-45",
  {
    variants: {
      variant: {
        // Rojo de imprenta: CTA primario.
        primary: `${PRINTED} bg-brand text-on-fill hover:bg-brand-ink`,
        // Acento del partido/equipo (se tiñe en runtime via --accent).
        accent: `${PRINTED} bg-accent text-on-fill hover:brightness-95`,
        // Papel con tinta: acción secundaria.
        outline: `${PRINTED} bg-bg-elevated text-fg hover:bg-bg-raised`,
        ghost: "font-sans font-semibold normal-case tracking-normal text-fg-muted underline-offset-4 hover:text-fg hover:underline",
        danger: `${PRINTED} bg-ink text-bg hover:bg-fg-muted`,
      },
      size: {
        sm: "h-9 px-4 text-base",
        md: "h-11 px-5 text-lg",
        lg: "h-13 px-7 text-xl",
      },
      block: { true: "w-full", false: "" },
    },
    defaultVariants: { variant: "primary", size: "md", block: false },
  },
);

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants>;

export function Button({ className, variant, size, block, type, ...props }: ButtonProps) {
  return (
    <button
      type={type ?? "button"}
      className={cn(buttonVariants({ variant, size, block }), className)}
      {...props}
    />
  );
}
