"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { routeFor } from "@/lib/nav/routes";
import { cn } from "@/lib/cn";

/**
 * Header de pantalla — el patrón de navegación común (feedback 14/11). Volver al PADRE declarado en
 * `lib/nav/routes.ts` (nunca `history.back()`), título de la pantalla y una acción opcional a la derecha.
 *
 * Dos modos:
 *  · Automático (layout `(app)`): lee el pathname → título y padre del mapa. Ninguna pantalla puede
 *    olvidarse del volver.
 *  · Con `onBack` (pantallas de juego): el volver es una ACCIÓN (salir de la sala, cancelar la cola)
 *    que navega al padre sin esperar al server (ver `useNav().leave`).
 *
 * Client Component solo por `usePathname`. Área táctil ≥ 44px.
 */
export function ScreenHeader({
  title,
  onBack,
  backLabel,
  action,
  hideTitle = false,
  className,
}: {
  /** Solo volver (sitio: la tarjeta de auth ya tiene su propio h1). */
  hideTitle?: boolean;
  /** Pisa el título del mapa (p. ej. "Sala ABC123"). */
  title?: string;
  /** Volver como acción (juego). Sin esto, el volver es un link al padre del mapa. */
  onBack?: () => void;
  /** Texto del volver cuando es acción ("Salir", "Cancelar"). */
  backLabel?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  const pathname = usePathname();
  const route = routeFor(pathname);
  const parent = route?.parent ?? null;
  const parentTitle = parent ? (routeFor(parent)?.title ?? "Volver") : null;
  const label = backLabel ?? parentTitle;

  const backClass =
    "-ml-2 inline-flex min-h-11 min-w-11 items-center gap-1.5 rounded-[4px] px-2 font-display text-lg font-extrabold uppercase tracking-[0.04em] text-fg hover:bg-bg-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue";
  const arrow = (
    <span aria-hidden className="text-2xl leading-none">
      ←
    </span>
  );

  return (
    <header
      className={cn(
        "relative z-20 flex min-h-14 w-full shrink-0 items-center gap-2 border-b-2 border-ink bg-bg px-4 pt-[env(safe-area-inset-top)]",
        className,
      )}
    >
      <div className="flex min-w-0 flex-1 items-center gap-2">
        {onBack ? (
          <button type="button" onClick={onBack} data-nav="back" className={backClass}>
            {arrow}
            <span>{label ?? "Volver"}</span>
          </button>
        ) : parent ? (
          <Link href={parent} data-nav="back" className={backClass} aria-label={`Volver a ${parentTitle}`}>
            {arrow}
            <span className="max-[359px]:sr-only">{label}</span>
          </Link>
        ) : null}
      </div>
      {!hideTitle && (
        <h1 className="truncate font-display text-xl font-black uppercase leading-none tracking-[0.02em] text-fg">
          {title ?? route?.title}
        </h1>
      )}
      <div className="flex min-w-0 flex-1 items-center justify-end gap-2">{action}</div>
    </header>
  );
}
