import type { Metadata } from "next";
import Link from "next/link";
import { getSession } from "@/lib/supabase/session";
import { ResetPasswordForm } from "@/components/auth/ResetPasswordForm";
import { AuthShell } from "@/components/auth/AuthShell";

// Utilidad de auth → noindex (D2).
export const metadata: Metadata = { robots: { index: false, follow: false } };

/**
 * Pantalla para elegir nueva contraseña. Se llega tras verificar el link de recuperación
 * (`/auth/confirm` dejó una sesión de recovery). Sin sesión válida, no se puede resetear.
 */
export default async function ResetPage() {
  const { user } = await getSession();

  return (
    <AuthShell>
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
    </AuthShell>
  );
}
