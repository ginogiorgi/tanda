import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { RegisterForm } from "@/components/auth/RegisterForm";

export default async function RegisterPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  // Un usuario permanente no se re-registra. El invitado (anónimo) SÍ entra: upgradea su sesión.
  if (user && !user.is_anonymous) redirect("/");
  const upgrade = user?.is_anonymous === true;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1 text-center">
        <h1 className="text-xl font-bold">
          {upgrade ? "Pasá tu invitado a cuenta" : "Crear cuenta"}
        </h1>
        <p className="text-sm text-fg-muted">
          {upgrade
            ? "Elegí usuario y contraseña. Mantenés tu jugador y lo podés editar."
            : "Solo usuario y contraseña. El email es opcional, después."}
        </p>
      </div>
      <RegisterForm upgrade={upgrade} />
    </div>
  );
}
