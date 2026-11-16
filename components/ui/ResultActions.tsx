import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/Button";

/**
 * Acciones de una pantalla de resultado (feedback 2, P5) — una sola jerarquía para todas: la primaria
 * (la única roja) arriba y hasta dos secundarias `outline`, TODAS del mismo tamaño (`lg`, ancho
 * completo). El invitado ve una invitación a crear cuenta DEBAJO, no un cuarto botón.
 */
export interface ResultAction {
  label: string;
  /** Navegación (Link). */
  href?: string;
  onClick?: () => void;
  disabled?: boolean;
}

function ActionButton({ action, variant }: { action: ResultAction; variant: "primary" | "outline" }) {
  if (action.href) {
    return (
      <Link href={action.href} className={buttonVariants({ variant, size: "lg", block: true })}>
        {action.label}
      </Link>
    );
  }
  return (
    <Button type="button" variant={variant} size="lg" block onClick={action.onClick} disabled={action.disabled}>
      {action.label}
    </Button>
  );
}

export function ResultActions({
  primary,
  secondary = [],
  guest = false,
  error,
}: {
  primary: ResultAction;
  /** Máximo dos (la API no deja más). */
  secondary?: [] | [ResultAction] | [ResultAction, ResultAction];
  /** Invitado: invitación a guardar el progreso, debajo de los botones. */
  guest?: boolean;
  error?: string | null;
}) {
  return (
    <div data-testid="result-actions" className="flex w-full flex-col items-stretch gap-3">
      <ActionButton action={primary} variant="primary" />
      {error && <p className="text-center text-sm font-semibold text-brand-ink">{error}</p>}
      {secondary.map((a) => (
        <ActionButton key={a.label} action={a} variant="outline" />
      ))}
      {guest && (
        <p className="mt-1 text-center text-sm text-fg-muted">
          ¿Querés guardar esto?{" "}
          <Link href="/register" className="font-semibold text-brand-ink underline-offset-2 hover:underline">
            Creá tu cuenta →
          </Link>
        </p>
      )}
    </div>
  );
}
