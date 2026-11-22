"use client";

/**
 * Boundary de error a nivel raíz (App Router): captura cualquier excepción no manejada en el render de las
 * rutas anidadas y muestra la pantalla de disculpas de marca, que reporta sola el bug (feedback 4 F).
 */

import { useEffect } from "react";
import { ErrorScreen } from "@/components/feedback/ErrorScreen";
import { Footer } from "@/components/ui/Footer";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Rastro en la consola del navegador para diagnóstico (el detalle no se muestra al usuario).
    console.error(error);
  }, [error]);

  return (
    <>
      <main className="flex w-full flex-1 flex-col">
        <ErrorScreen error={error} source="route" onRetry={reset} />
      </main>
      {/* Feedback 4 #10: el boundary reemplaza a los layouts de grupo → monta su propio footer. */}
      <Footer />
    </>
  );
}
