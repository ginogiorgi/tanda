import Link from "next/link";
import { buttonVariants } from "@/components/ui/Button";

/**
 * 404 amistoso (App Router): cualquier ruta inexistente cae acá con un camino claro de vuelta al
 * inicio, en línea con el resto de los estados vacíos/error (9.2).
 */
export default function NotFound() {
  return (
    <main className="flex min-h-0 w-full flex-1 flex-col items-center justify-center gap-6 overflow-y-auto px-6 py-16 text-center">
      <div className="flex flex-col items-center gap-2">
        <span className="text-xs font-bold uppercase tracking-[0.2em] text-brand-ink">
          Error 404
        </span>
        <h1 className="font-display text-7xl font-black uppercase leading-[0.85] text-fg">Tiro desviado</h1>
        <p className="max-w-md text-balance text-sm text-fg-muted">
          Esta página no existe o se mudó de cancha.
        </p>
      </div>
      <Link
        href="/"
        className={buttonVariants({ size: "lg" })}
      >
        Volver al inicio
      </Link>
    </main>
  );
}
