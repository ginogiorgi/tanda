import Link from "next/link";

/**
 * 404 amistoso (App Router): cualquier ruta inexistente cae acá con un camino claro de vuelta al
 * inicio, en línea con el resto de los estados vacíos/error (9.2).
 */
export default function NotFound() {
  return (
    <main className="flex min-h-dvh w-full flex-col items-center justify-center gap-6 px-6 py-16 text-center">
      <div className="flex flex-col items-center gap-2">
        <span className="text-sm font-medium uppercase tracking-[0.3em] text-fg-subtle">
          Error 404
        </span>
        <h1 className="text-5xl font-extrabold tracking-tight text-gold">Tiro desviado</h1>
        <p className="max-w-md text-balance text-sm text-fg-muted">
          Esta página no existe o se mudó de cancha.
        </p>
      </div>
      <Link
        href="/"
        className="rounded-lg bg-gold px-6 py-3 font-semibold text-bg transition-opacity hover:opacity-90"
      >
        Volver al inicio
      </Link>
    </main>
  );
}
