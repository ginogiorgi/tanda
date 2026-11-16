import { cn } from "@/lib/cn";

/** Input del sistema. Reemplaza el `rounded-[4px] border … focus:border-brand` repetido en los forms. */
export type InputProps = React.InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean };

export function Input({ className, invalid, ...props }: InputProps) {
  return (
    <input
      className={cn(
        "w-full rounded-[4px] border-2 border-ink bg-bg-raised px-4 py-3 text-base text-fg placeholder:text-fg-subtle transition-shadow focus:shadow-card focus:outline-none disabled:opacity-50",
        invalid && "border-danger focus:shadow-[3px_3px_0_0_var(--danger)]",
        className,
      )}
      aria-invalid={invalid || undefined}
      {...props}
    />
  );
}

/** Campo: label + control + hint/error. Mantiene consistente el espaciado de los forms. */
export function Field({
  label,
  htmlFor,
  hint,
  error,
  children,
  className,
}: {
  label?: string;
  htmlFor?: string;
  hint?: string;
  error?: string | null;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      {label && (
        <label htmlFor={htmlFor} className="text-xs font-bold uppercase tracking-[0.12em] text-fg">
          {label}
        </label>
      )}
      {children}
      {error ? (
        <p className="text-xs font-semibold text-brand-ink">{error}</p>
      ) : hint ? (
        <p className="text-xs text-fg-subtle">{hint}</p>
      ) : null}
    </div>
  );
}
