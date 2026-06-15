import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { LogoutButton } from "@/components/auth/LogoutButton";
import { RecoveryEmailForm } from "@/components/auth/RecoveryEmailForm";

/**
 * Perfil del usuario. Scaffold de F2 2.5/2.6: username, editar jugador y email de
 * recuperación. El 3D del avatar se edita en `/avatar` (no se renderiza acá: el 3D va solo
 * en creador y penal, SPEC §8.2). La pestaña Historial/stats (2.7) se agrega después.
 */
export default async function PerfilPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const recoveryEmailRaw = user.user_metadata?.recovery_email;
  const recoveryEmail =
    typeof recoveryEmailRaw === "string" && recoveryEmailRaw ? recoveryEmailRaw : null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("username")
    .eq("id", user.id)
    .single();

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-8 px-6 py-12">
      <div className="flex flex-col gap-1">
        <span className="text-sm font-medium uppercase tracking-[0.2em] text-fg-subtle">
          Perfil
        </span>
        <h1 className="text-3xl font-extrabold tracking-tight text-gold">
          {profile?.username ?? "Jugador"}
        </h1>
      </div>

      <section className="flex flex-col gap-3 rounded-2xl border border-border bg-bg-elevated p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-fg-subtle">
          Tu jugador
        </h2>
        <p className="text-sm text-fg-muted">
          Es el mismo que patea y ataja los penales. En cada partido viste la camiseta de la
          selección que te toca.
        </p>
        <Link
          href="/avatar"
          className="self-start rounded-lg bg-gold px-5 py-2.5 text-sm font-semibold text-bg transition-opacity hover:opacity-90"
        >
          Editar jugador
        </Link>
      </section>

      <section className="flex flex-col gap-3 rounded-2xl border border-border bg-bg-elevated p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-fg-subtle">
          Email de recuperación
        </h2>
        <RecoveryEmailForm initialEmail={recoveryEmail} />
      </section>

      <div className="flex items-center justify-between">
        <Link href="/" className="text-sm font-medium text-fg-muted hover:text-fg">
          ← Inicio
        </Link>
        <LogoutButton />
      </div>
    </main>
  );
}
