import { cn } from "@/lib/cn";

/** Input del sistema. Reemplaza el `rounded-lg border … focus:border-gold` repetido en los forms. */
export type InputProps = React.InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean };

export function Input({ className, invalid, ...props }: InputProps) {
  return (
    <input
      className={cn(
        "w-full rounded-lg border border-border bg-bg-elevated px-4 py-3 text-sm text-fg placeholder:text-fg-subtle transition-colors focus:border-gold focus:outline-none focus:ring-2 focus:ring-gold/25 disabled:opacity-50",
        invalid && "border-danger focus:border-danger focus:ring-danger/25",
        className,
      )}
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
        <label htmlFor={htmlFor} className="text-sm font-medium text-fg-muted">
          {label}
        </label>
      )}
      {children}
      {error ? (
        <p className="text-xs text-danger">{error}</p>
      ) : hint ? (
        <p className="text-xs text-fg-subtle">{hint}</p>
      ) : null}
    </div>
  );
}
