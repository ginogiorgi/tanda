import { cn } from "@/lib/cn";

/**
 * Footer de las pantallas de menú/sitio, al final del documento y en el flujo (nunca `fixed`). Lo montan los
 * layouts `(app)`, `(auth)`, `(site)`, la 404 y la de error; el juego `(game)` no lleva (feedback 4 #10).
 * Feedback 3 #10: si el contenido entra, se ve al pie sin scroll; si no, aparece al scrollear.
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
