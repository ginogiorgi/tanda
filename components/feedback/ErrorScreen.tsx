"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/Button";
import { sendAutoReport, type AutoReportSource, type ReportableError } from "@/lib/feedback/sendAutoReport";

/**
 * Pantalla de error de marca (feedback 4 F): pide disculpas, ofrece reintentar y **reporta sola** el bug
 * al montarse (`POST /api/feedback` con `kind: "auto"`; el server deduplica y manda como mucho un mail
 * cada 24 h por error). "Avisar de este bug" solo agradece: el reporte ya salió (decisión de Gino).
 * La usan `app/error.tsx`, `app/global-error.tsx` y el juego cuando un penal queda trabado sin arreglo.
 */
export function ErrorScreen({
  error,
  source,
  onRetry,
  title = "Hubo un error, perdón",
  detail = "Se nos escapó la pelota. Ya nos llegó el aviso; probá de nuevo y, si sigue, volvé al inicio.",
}: {
  error: ReportableError;
  source: AutoReportSource;
  onRetry: () => void;
  title?: string;
  detail?: string;
}) {
  const [thanked, setThanked] = useState(false);

  useEffect(() => {
    sendAutoReport(error, source);
  }, [error, source]);

  return (
    <div data-testid="error-screen" className="flex w-full flex-1 flex-col items-center justify-center gap-6 px-6 py-16 text-center">
      <div className="flex flex-col items-center gap-2">
        <span className="text-xs font-bold uppercase tracking-[0.2em] text-brand-ink">Uh, algo falló</span>
        <h1 className="font-display text-5xl font-black uppercase leading-[0.9] text-fg">{title}</h1>
        <p className="max-w-md text-balance text-sm text-fg-muted">{detail}</p>
      </div>
      <div className="flex flex-col items-center gap-3 sm:flex-row">
        {/* `buttonVariants` y no `<Button>`: el boundary va en el bundle de TODAS las rutas y `<Button>` arrastra
            tailwind-merge (perf:budget). */}
        <button type="button" onClick={onRetry} className={buttonVariants({ size: "lg" })}>
          Reintentar
        </button>
        <Link href="/" className={buttonVariants({ variant: "outline", size: "lg" })}>
          Volver al inicio
        </Link>
      </div>
      <div aria-live="polite" className="min-h-6">
        {thanked ? (
          <p className="text-sm font-semibold text-fg">¡Gracias! Lo vamos a revisar.</p>
        ) : (
          <button
            type="button"
            onClick={() => setThanked(true)}
            className="text-sm font-medium text-fg-subtle underline-offset-2 hover:text-fg hover:underline"
          >
            Avisar de este bug
          </button>
        )}
      </div>
    </div>
  );
}
