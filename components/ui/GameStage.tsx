import { cn } from "@/lib/cn";

/**
 * Escenario de juego (feedback 2, P4 — DESIGN-RULES §Layout): exactamente un viewport (menos el
 * header si la pantalla lo tiene), `relative`. Escena 3D, tarjeta, globo y HUD van `absolute`
 * ADENTRO del stage: mientras jugás se ven fijos, y si scrolleás aparece el footer debajo. Es
 * "pegado lo que tiene que estar pegado" sin `fixed`.
 */
export function GameStage({
  header = false,
  className,
  children,
}: {
  /** La pantalla tiene ScreenHeader arriba → el stage mide el viewport menos el header. */
  header?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      data-stage
      className={cn(
        "relative w-full shrink-0 overflow-hidden",
        header ? "h-[calc(100svh-var(--header-h))]" : "h-svh",
        className,
      )}
    >
      {children}
    </div>
  );
}
