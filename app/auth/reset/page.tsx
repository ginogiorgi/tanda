import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { ResetPasswordForm } from "@/components/auth/ResetPasswordForm";

/**
 * Pantalla para elegir nueva contraseña. Se llega tras verificar el link de recuperación
 * (`/auth/confirm` dejó una sesión de recovery). Sin sesión válida, no se puede resetear.
 */
export default async function ResetPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <main className="flex min-h-dvh w-full flex-col items-center justify-center gap-8 px-6 py-16">
      <Link href="/" className="text-4xl font-extrabold tracking-tight text-gold">
        TANDA
      </Link>
      <div className="w-full max-w-sm rounded-2xl border border-border bg-bg-elevated/40 p-6 sm:p-8">
        {user ? (
          <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-1 text-center">
              <h1 className="text-xl font-bold">Nueva contraseña</h1>
              <p className="text-sm text-fg-muted">Elegí una contraseña nueva.</p>
            </div>
            <ResetPasswordForm />
          </div>
        ) : (
          <div className="flex flex-col gap-4 text-center">
            <h1 className="text-xl font-bold">Link inválido o vencido</h1>
            <p className="text-sm text-fg-muted">
              El link de recuperación no es válido o ya venció. Pedí uno nuevo.
            </p>
            <Link
              href="/forgot"
              className="text-sm font-medium text-gold hover:underline"
            >
              Pedir otro link
            </Link>
          </div>
        )}
      </div>
    </main>
  );
}
