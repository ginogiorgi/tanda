import { cn } from "@/lib/cn";

/**
 * Footer global: crédito de autoría al fondo de la página (Tarea 5). `mt-auto` lo empuja abajo
 * de todo dentro del `body` (flex-col, min-h-full). Se monta una vez en `app/layout.tsx`.
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
