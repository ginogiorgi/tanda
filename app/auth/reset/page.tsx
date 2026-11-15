import type { Metadata } from "next";
import Link from "next/link";
import { Wordmark } from "@/components/brand/Wordmark";
import { getSession } from "@/lib/supabase/session";
import { ResetPasswordForm } from "@/components/auth/ResetPasswordForm";
import { Footer } from "@/components/ui/Footer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";

// Utilidad de auth → noindex (D2).
export const metadata: Metadata = { robots: { index: false, follow: false } };

/**
 * Pantalla para elegir nueva contraseña. Se llega tras verificar el link de recuperación
 * (`/auth/confirm` dejó una sesión de recovery). Sin sesión válida, no se puede resetear.
 */
export default async function ResetPage() {
  const { user } = await getSession();

  return (
    <main className="flex w-full flex-1 flex-col">
     <ScreenHeader hideTitle className="border-b-0 bg-transparent" />
     <div className="my-auto flex w-full flex-col items-center gap-8 px-6 py-16">
      <Link href="/" aria-label="Tanda — inicio">
        <Wordmark className="text-6xl" stamp={false} />
      </Link>
      <div className="w-full max-w-sm rounded-[6px] border-2 border-ink bg-bg-elevated p-6 shadow-pop sm:p-8">
        {user ? (
          <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-1 text-center">
              <h1 className="font-display text-3xl font-extrabold uppercase tracking-[0.02em]">Nueva contraseña</h1>
              <p className="text-sm text-fg-muted">Elegí una contraseña nueva.</p>
            </div>
            <ResetPasswordForm />
          </div>
        ) : (
          <div className="flex flex-col gap-4 text-center">
            <h1 className="font-display text-3xl font-extrabold uppercase tracking-[0.02em]">Link inválido o vencido</h1>
            <p className="text-sm text-fg-muted">
              El link de recuperación no es válido o ya venció. Pedí uno nuevo.
            </p>
            <Link
              href="/forgot"
              className="text-sm font-medium text-brand hover:underline"
            >
              Pedir otro link
            </Link>
          </div>
        )}
      </div>
     </div>
     <Footer />
    </main>
  );
}
