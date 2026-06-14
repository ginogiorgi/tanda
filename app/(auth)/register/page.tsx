import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { RegisterForm } from "@/components/auth/RegisterForm";

export default async function RegisterPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect("/");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1 text-center">
        <h1 className="text-xl font-bold">Crear cuenta</h1>
        <p className="text-sm text-fg-muted">
          Solo usuario y contraseña. El email es opcional, después.
        </p>
      </div>
      <RegisterForm />
    </div>
  );
}
