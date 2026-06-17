import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { LogoutButton } from "@/components/auth/LogoutButton";
import { RecoveryEmailForm } from "@/components/auth/RecoveryEmailForm";
import { getTournamentHistory } from "@/lib/profile/queries";
import { aggregateStats } from "@/lib/profile/history";

/** Posición final legible. `null` = todavía no terminó un torneo. */
function placementLabel(placement: number | null): string {
  if (placement === null) return "—";
  if (placement === 1) return "Campeón";
  return `#${placement}`;
}

/**
 * Perfil del usuario. F2 2.5/2.6/2.7: username, editar jugador, email de recuperación,
 * estadísticas e historial. El 3D del avatar se edita en `/avatar` (no se renderiza acá: el
 * 3D va solo en creador y penal, SPEC §8.2). El historial se nutre de datos de torneos
 * (`getTournamentHistory`, stub hasta F3/F6): por ahora muestra estado vacío.
 */
export default async function PerfilPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // Invitado (sesión anónima): perfil efímero, sin editar avatar / sin recuperación / sin historial.
  // Su lugar es jugar; el CTA lo invita a volverse permanente. (§8.4)
  if (user.is_anonymous) {
    const { data: guestProfile } = await supabase
      .from("profiles")
      .select("username")
      .eq("id", user.id)
      .single();

    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-8 px-6 py-12">
        <div className="flex flex-col gap-1">
          <span className="text-sm font-medium uppercase tracking-[0.2em] text-fg-subtle">
            Invitado
          </span>
          <h1 className="text-3xl font-extrabold tracking-tight text-gold">
            {guestProfile?.username ?? "Invitado"}
          </h1>
        </div>

        <section className="flex flex-col gap-3 rounded-2xl border border-border bg-bg-elevated p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-fg-subtle">
            Estás jugando como invitado
          </h2>
          <p className="text-sm text-fg-muted">
            Tenés un jugador con el look por defecto y podés jugar todas las salas. Nada se
            guarda: creá una cuenta para tener tu avatar a medida, tu historial y tus stats.
          </p>
          <Link
            href="/register"
            className="self-start rounded-lg bg-gold px-5 py-2.5 text-sm font-semibold text-bg transition-opacity hover:opacity-90"
          >
            Creá una cuenta
          </Link>
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

  const recoveryEmailRaw = user.user_metadata?.recovery_email;
  const recoveryEmail =
    typeof recoveryEmailRaw === "string" && recoveryEmailRaw ? recoveryEmailRaw : null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("username")
    .eq("id", user.id)
    .single();

  const history = await getTournamentHistory(supabase, user.id);
  const stats = aggregateStats(history);

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

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-fg-subtle">
          Estadísticas
        </h2>
        <div className="grid grid-cols-2 gap-3">
          <StatCard label="Títulos" value={stats.titles} />
          <StatCard label="Torneos jugados" value={stats.tournamentsPlayed} />
          <StatCard label="Victorias" value={`${Math.round(stats.winRate * 100)}%`} />
          <StatCard label="Goles" value={stats.goals} />
          <StatCard
            label="Mejor posición"
            value={placementLabel(stats.bestPlacement)}
          />
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-fg-subtle">
          Historial
        </h2>
        {history.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border p-6 text-center">
            <p className="text-sm text-fg-muted">
              Todavía no jugaste ningún torneo. Tocá Jugar para arrancar tu primera tanda.
            </p>
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {history.map((h) => (
              <li
                key={h.tournamentId}
                className="flex items-center justify-between rounded-xl border border-border bg-bg-elevated px-4 py-3"
              >
                <div className="flex flex-col">
                  <span className="text-sm font-medium text-fg">{h.nationName}</span>
                  <span className="text-xs text-fg-subtle">
                    {h.placement === 1
                      ? "Campeón"
                      : h.eliminatedPhase ?? "En curso"}
                  </span>
                </div>
                <span className="text-sm font-semibold text-gold">
                  {placementLabel(h.placement)}
                </span>
              </li>
            ))}
          </ul>
        )}
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

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-border bg-bg-elevated px-4 py-3">
      <span className="text-2xl font-extrabold tracking-tight text-fg">{value}</span>
      <span className="text-xs font-medium uppercase tracking-wide text-fg-subtle">
        {label}
      </span>
    </div>
  );
}
