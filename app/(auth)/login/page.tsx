import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { LoginForm } from "@/components/auth/LoginForm";

export const metadata: Metadata = {
  title: "Iniciar sesión",
  description: "Entrá a tu cuenta de Tanda y seguí compitiendo en la trivia mundialista en tiempo real.",
  alternates: { canonical: "/login" },
};

export default async function LoginPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect("/");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1 text-center">
        <h1 className="text-xl font-bold">Entrar</h1>
        <p className="text-sm text-fg-muted">Bienvenido de vuelta.</p>
      </div>
      <LoginForm />
    </div>
  );
}
