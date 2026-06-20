import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";

/**
 * Botón broadcast-FIFA. `buttonVariants()` se exporta aparte para vestir `<Link>` con el mismo
 * look sin duplicar strings (los CTAs de navegación son links, no `<button>`).
 */
export const buttonVariants = cva(
  "inline-flex select-none items-center justify-center gap-2 rounded-lg font-semibold tracking-tight transition-[transform,filter,box-shadow,background-color,border-color,color,opacity] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg disabled:pointer-events-none disabled:opacity-50 motion-safe:active:scale-[0.98]",
  {
    variants: {
      variant: {
        // Dorado de trofeo: CTA primario.
        primary: "bg-gold-grad text-bg shadow-[0_8px_24px_-12px_var(--gold)] hover:brightness-105",
        // Acento del partido/nación (se tiñe en runtime via --accent).
        accent:
          "bg-accent-grad text-bg shadow-[0_8px_24px_-12px_var(--accent)] hover:brightness-105",
        outline:
          "border border-border bg-bg-elevated/60 text-fg hover:border-ring hover:bg-bg-elevated",
        ghost: "text-fg-muted hover:bg-bg-elevated hover:text-fg",
        danger: "bg-danger text-fg shadow-[0_8px_24px_-12px_var(--danger)] hover:brightness-110",
      },
      size: {
        sm: "h-9 px-4 text-sm",
        md: "h-11 px-5 text-sm",
        lg: "h-12 px-6 text-base",
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
