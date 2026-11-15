import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";

/**
 * Lo que ocupa el lugar de una escena 3D mientras no está (feedback 2, P2.1): un recuadro neutro con
 * la trama de la marca y un pulso suave — nunca una silueta ni otro muñeco — y, si los modelos no
 * bajan, un error claro con "Reintentar". Presentacional (el estado lo maneja `useGlbReady`).
 */
export function Scene3DSkeleton({ className, label = "Cargando jugadores 3D" }: { className?: string; label?: string }) {
  return (
    <div
      data-testid="scene-skeleton"
      role="status"
      aria-label={label}
      className={cn("h-full w-full bg-bg-elevated bg-halftone motion-safe:animate-pulse", className)}
    />
  );
}

export function Scene3DError({ onRetry, className }: { onRetry: () => void; className?: string }) {
  return (
    <div
      data-testid="scene-error"
      role="alert"
      className={cn("flex h-full w-full flex-col items-center justify-end gap-3 bg-bg-elevated bg-halftone p-6 text-center", className)}
    >
      <p className="text-sm font-semibold text-fg-muted">No pudimos cargar los jugadores 3D.</p>
      <Button type="button" variant="outline" size="sm" onClick={onRetry}>
        Reintentar
      </Button>
    </div>
  );
}
