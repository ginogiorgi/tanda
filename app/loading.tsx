/** Carga del inicio y del sitio (landing/auth): pinta al instante (ver `(app)/loading.tsx`). */
export default function RootLoading() {
  return (
    <div role="status" className="flex flex-1 flex-col items-center justify-center gap-3">
      <span aria-hidden className="size-10 rounded-full border-4 border-ink border-t-transparent motion-safe:animate-spin" />
      <span className="sr-only">Cargando</span>
    </div>
  );
}
