import { ScreenHeader } from "@/components/ui/ScreenHeader";

/**
 * Layout de la APP (perfil, tabla, avatar, historial, jugar): header común con volver al padre
 * (lib/nav/routes) + contenido que scrollea con el DOCUMENTO (feedback 2, P4). El header vive en el
 * layout → persiste entre navegaciones y se ve al instante mientras carga la pantalla (`loading.tsx`).
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <ScreenHeader />
      <main className="flex w-full flex-1 flex-col">{children}</main>
    </>
  );
}
