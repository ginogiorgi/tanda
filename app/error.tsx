"use client";

/**
 * Boundary de error a nivel raíz (App Router): captura cualquier excepción no manejada en el
 * render de las rutas/Server Components anidados (p. ej. una RPC que tira o la red caída en
 * `/partido`, `/perfil`, `/sala/[code]`) y muestra un fallback claro con reintento, en vez de la
 * pantalla en blanco por defecto. Parte del pulido de estados de error (9.2).
 */

import { useEffect } from "react";
import Link from "next/link";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Deja rastro en consola del navegador para diagnóstico (el detalle no se muestra al usuario).
    console.error(error);
  }, [error]);

  return (
    <main className="flex min-h-0 w-full flex-1 flex-col items-center justify-center gap-6 overflow-y-auto px-6 py-16 text-center">
      <div className="flex flex-col items-center gap-2">
        <span className="text-xs font-bold uppercase tracking-[0.2em] text-brand-ink">
          Uh, algo falló
        </span>
        <h1 className="text-3xl font-extrabold tracking-tight text-brand">
          Se nos escapó la pelota
        </h1>
        <p className="max-w-md text-balance text-sm text-fg-muted">
          Hubo un problema al cargar esta pantalla. Probá de nuevo; si sigue, volvé al inicio.
        </p>
      </div>
      <div className="flex flex-col items-center gap-3 sm:flex-row">
        <button
          onClick={reset}
          className="rounded-[4px] bg-brand px-6 py-3 font-semibold text-bg transition-opacity hover:opacity-90"
        >
          Reintentar
        </button>
        <Link
          href="/"
          className="rounded-[4px] border border-border px-6 py-3 font-medium text-fg transition-colors hover:border-fg-subtle"
        >
          Volver al inicio
        </Link>
      </div>
    </main>
  );
}
