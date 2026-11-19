import { cn } from "@/lib/cn";

/**
 * Contenedor de pantalla (feedback 2, P4 — DESIGN-RULES §Layout). La página scrollea el DOCUMENTO,
 * nunca un panel: esto solo fija el ancho según el tipo de contenido y estira (`flex-1`) el alto que sobre,
 * así el footer queda al pie: sin scroll si entra (feedback 3 #10), scrolleando si no.
 *
 *  · `form`    = max-w-sm  (login, registro, tarjetas chicas)
 *  · `content` = max-w-2xl (home, perfil, jugar, sala, cola)
 *  · `wide`    = max-w-6xl (bracket, tabla, historial)
 */
const WIDTH = {
  form: "max-w-sm",
  content: "max-w-2xl",
  wide: "max-w-6xl",
} as const;

export function Page({
  width = "content",
  center = false,
  className,
  children,
}: {
  width?: keyof typeof WIDTH;
  /** Centra el contenido en el alto disponible (pantallas cortas: sala, cola, resultado). */
  center?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      data-page={width}
      className={cn(
        "mx-auto flex w-full flex-1 flex-col gap-6 px-4 py-6 md:px-6",
        WIDTH[width],
        center && "items-center justify-center",
        className,
      )}
    >
      {children}
    </div>
  );
}
