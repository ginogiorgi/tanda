import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ForgotPasswordForm } from "@/components/auth/ForgotPasswordForm";

// Utilidad de auth → noindex (D2).
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function ForgotPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect("/");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1 text-center">
        <h1 className="font-display text-3xl font-extrabold uppercase tracking-[0.02em]">Recuperar contraseña</h1>
        <p className="text-sm text-fg-muted">
          Poné tu usuario y, si tenés un email cargado, te mandamos un link.
        </p>
      </div>
      <ForgotPasswordForm />
    </div>
  );
}
