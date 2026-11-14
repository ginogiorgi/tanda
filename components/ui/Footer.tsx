import { cn } from "@/lib/cn";

/**
 * Footer del SITIO (landing y auth): crédito de autoría al final del contenido scrolleable. NO va en
 * la app ni en el juego (feedback 14/11: en partida la pantalla es fija, sin footer). `mt-auto` lo
 * empuja al fondo cuando el contenido es corto.
 */
export function Footer({ className }: { className?: string }) {
  return (
    <footer
      className={cn(
        "mt-auto w-full border-t-2 border-ink px-6 py-6 text-center",
        className,
      )}
    >
      <p className="text-xs text-fg-subtle">
        Hecho por{" "}
        <a
          href="https://www.pyrux.com.ar/es/creator/gino-ruben-giorgi"
          target="_blank"
          rel="noopener noreferrer"
          className="font-semibold text-pyrux underline-offset-2 hover:underline"
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
