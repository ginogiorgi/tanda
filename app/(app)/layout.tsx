import { ScreenHeader } from "@/components/ui/ScreenHeader";

/**
 * Layout de la APP (perfil, tabla, avatar, historial): header común con volver al padre (lib/nav/routes)
 * + contenido con scroll interno. Sin footer: el footer es del sitio (landing/auth), no de la app.
 * El header vive en el layout → persiste entre navegaciones y se ve al instante mientras carga la
 * pantalla nueva (`loading.tsx`).
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-0 w-full flex-1 flex-col">
      <ScreenHeader />
      <main className="flex min-h-0 w-full flex-1 flex-col overflow-y-auto overscroll-contain">{children}</main>
    </div>
  );
}
