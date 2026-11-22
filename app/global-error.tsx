"use client";

/**
 * Error en el layout raíz (feedback 4 F): reemplaza TODO el documento, así que trae su propio `<html>` y
 * los estilos globales (sin las fuentes de `next/font`: cae a las de sistema, alcanza para disculparse).
 * Mínimo a propósito: Next lo suma al bundle de TODAS las rutas (con `ErrorScreen`/`Link`/`cva` eran +5 KB
 * gz por ruta, perf:budget). Mismo texto y mismo reporte automático que `ErrorScreen`.
 */

import { useEffect, useState } from "react";
import { sendAutoReport } from "@/lib/feedback/sendAutoReport";
import "./globals.css";

const BTN =
  "inline-flex h-12 items-center justify-center rounded-[4px] border-2 border-ink px-6 font-display text-lg font-black uppercase shadow-card";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const [thanked, setThanked] = useState(false);
  useEffect(() => {
    sendAutoReport(error, "global");
  }, [error]);

  return (
    <html lang="es">
      <body className="flex min-h-svh flex-col bg-bg text-fg">
        <main data-testid="error-screen" className="flex w-full flex-1 flex-col items-center justify-center gap-6 px-6 py-16 text-center">
          <span className="text-xs font-bold uppercase tracking-[0.2em] text-brand-ink">Uh, algo falló</span>
          <h1 className="font-display text-5xl font-black uppercase leading-[0.9]">Hubo un error, perdón</h1>
          <p className="max-w-md text-balance text-sm text-fg-muted">
            Se nos escapó la pelota. Ya nos llegó el aviso; probá de nuevo y, si sigue, volvé al inicio.
          </p>
          <div className="flex flex-col items-center gap-3 sm:flex-row">
            <button type="button" onClick={reset} className={`${BTN} bg-brand text-on-fill`}>
              Reintentar
            </button>
            {/* Recarga completa a propósito: el layout raíz se rompió. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a href="/" className={`${BTN} bg-bg-elevated text-fg`}>
              Volver al inicio
            </a>
          </div>
          <div aria-live="polite" className="min-h-6">
            {thanked ? (
              <p className="text-sm font-semibold">¡Gracias! Lo vamos a revisar.</p>
            ) : (
              <button type="button" onClick={() => setThanked(true)} className="text-sm font-medium text-fg-subtle underline-offset-2 hover:underline">
                Avisar de este bug
              </button>
            )}
          </div>
        </main>
      </body>
    </html>
  );
}
