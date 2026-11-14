import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/supabase/session";
import { LoginForm } from "@/components/auth/LoginForm";

export const metadata: Metadata = {
  title: "Iniciar sesión",
  description: "Entrá a tu cuenta de Tanda y seguí compitiendo en la trivia mundialista en tiempo real.",
  alternates: { canonical: "/login" },
};

export default async function LoginPage() {
  const { user } = await getSession();
  if (user) redirect("/");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1 text-center">
        <h1 className="font-display text-3xl font-extrabold uppercase tracking-[0.02em]">Entrar</h1>
        <p className="text-sm text-fg-muted">Bienvenido de vuelta.</p>
      </div>
      <LoginForm />
    </div>
  );
}
