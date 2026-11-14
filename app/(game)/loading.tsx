/** Carga de pantallas de juego: pinta al instante (ver `(app)/loading.tsx`). */
export default function GameLoading() {
  return (
    <div role="status" className="flex flex-1 flex-col items-center justify-center gap-3">
      <span aria-hidden className="size-10 rounded-full border-4 border-ink border-t-transparent motion-safe:animate-spin" />
      <span className="font-display text-xl font-extrabold uppercase tracking-[0.06em] text-fg">Cargando…</span>
    </div>
  );
}
