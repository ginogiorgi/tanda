import { Footer } from "@/components/ui/Footer";

/**
 * Layout de SITIO (home y nueva contraseña): contenido en el flujo del documento + footer al pie.
 * Feedback 4 #10: el footer lo monta cada grupo de pantallas de menú/sitio — `(app)`, `(auth)`, `(site)` —
 * y nunca el de juego `(game)`, donde metía scroll en el celu. El layout raíz ya no lo monta.
 */
export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <div className="flex w-full flex-1 flex-col">{children}</div>
      <Footer />
    </>
  );
}
