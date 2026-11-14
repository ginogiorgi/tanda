/**
 * Esqueleto de las pantallas de la app. Que exista es lo que hace rápido el toque: en rutas dinámicas el
 * prefetch de `<Link>` baja hasta el `loading` más cercano, así que la navegación pinta esto al instante
 * (con el header del layout ya actualizado) mientras el server responde.
 */
export default function AppLoading() {
  return (
    <div
      role="status"
      aria-label="Cargando"
      className="mx-auto flex w-full max-w-md flex-col gap-4 px-6 py-8 motion-safe:animate-pulse"
    >
      <span className="h-12 w-2/3 rounded-[4px] bg-bg-raised" />
      <span className="h-28 w-full rounded-[4px] border-2 border-ink/20 bg-bg-raised" />
      <span className="h-28 w-full rounded-[4px] border-2 border-ink/20 bg-bg-raised" />
      <span className="h-20 w-full rounded-[4px] border-2 border-ink/20 bg-bg-raised" />
    </div>
  );
}
