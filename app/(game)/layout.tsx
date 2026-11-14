/**
 * Layout de JUEGO (sala, cola ranked, partido): pantalla fija del alto del viewport, sin footer y sin
 * scroll de página ni rebote (feedback 14/11: "dentro de la partida, que esté fijo en la pantalla").
 * Si una vista no entra (bracket de 48), scrollea SOLO su panel, nunca la página.
 */
export default function GameLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-0 w-full flex-1 flex-col overflow-hidden overscroll-none pb-[env(safe-area-inset-bottom)]">
      {children}
    </main>
  );
}
