import { cn } from "@/lib/cn";

/**
 * Footer de TODAS las pantallas (feedback 2, P4): lo monta el layout raíz al final del documento. El
 * contenido ocupa al menos el alto visible, así que el footer no se ve al cargar y aparece al scrollear
 * hasta el fondo (en juego, debajo del GameStage).
 */
export function Footer({ className }: { className?: string }) {
  return (
    <footer
      className={cn(
        "w-full border-t-2 border-ink bg-bg px-6 py-6 text-center",
        className,
      )}
    >
      <p className="text-xs text-fg-subtle">
        Hecho por{" "}
        <a
          href="https://www.pyrux.com.ar/es/creator/gino-ruben-giorgi"
          target="_blank"
          rel="noopener noreferrer"
          className="font-semibold text-pyrux-ink underline-offset-2 hover:underline"
        >
          Gino Giorgi
        </a>{" "}
        y{" "}
        <a
          href="https://www.instagram.com/delpianojuan/"
          target="_blank"
          rel="noopener noreferrer"
          className="font-semibold text-fg underline-offset-2 hover:underline"
        >
          JM10
        </a>
      </p>
      <p className="mt-1 text-xs text-fg-subtle">
        © 2026 Tanda — Pyrux. Todos los derechos reservados.
      </p>
    </footer>
  );
}
