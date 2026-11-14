import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { freshUserMetadata, getSession } from "@/lib/supabase/session";
import { LogoutButton } from "@/components/auth/LogoutButton";
import { RecoveryEmailForm } from "@/components/auth/RecoveryEmailForm";
import { getTournamentHistory } from "@/lib/profile/queries";

// Privada y por usuario → noindex (D2).
export const metadata: Metadata = { robots: { index: false, follow: false } };
import { aggregateStats } from "@/lib/profile/history";
import { HistoryEntryCard } from "@/components/profile/HistoryEntryCard";
import { Card } from "@/components/ui/Card";
import { Eyebrow, SectionTitle } from "@/components/ui/Typography";
import { StatCard } from "@/components/ui/StatCard";
import { buttonVariants } from "@/components/ui/Button";
import { ProfileStatsRows } from "@/components/profile/ProfileStatsRows";
import { LeagueCard } from "@/components/profile/LeagueCard";

/**
 * Perfil del usuario. F2 2.5/2.6/2.7: username, editar jugador, email de recuperación,
 * estadísticas e historial. El 3D del avatar se edita en `/avatar` (no se renderiza acá: el
 * 3D va solo en creador y penal, SPEC §8.2). El historial se nutre de datos de torneos reales
 * vía `getTournamentHistory` (RPC `get_tournament_history`, 10.10).
 */
export default async function PerfilPage() {
  const { supabase, user } = await getSession();

  if (!user) redirect("/login");

  // Invitado (sesión anónima): perfil efímero, sin editar avatar / sin recuperación / sin historial.
  // Su lugar es jugar; el CTA lo invita a volverse permanente. (§8.4)
  if (user.isAnonymous) {
    const [{ data: guestProfile }, { data: guestStats }, { data: guestRanked }] = await Promise.all([
      supabase.from("profiles").select("username").eq("id", user.id).single(),
      supabase.rpc("get_profile_stats"),
      supabase.rpc("get_ranked_me"),
    ]);

    return (
      <div className="mx-auto flex w-full max-w-md flex-col gap-8 px-6 py-6">

        <div className="flex flex-col gap-1">
          <Eyebrow>Invitado</Eyebrow>
          <h2 className="font-display text-5xl font-black uppercase leading-[0.9] text-fg">
            {guestProfile?.username ?? "Invitado"}
          </h2>
        </div>

        {guestRanked && <LeagueCard ranked={guestRanked} />}

        {guestStats && (
          <section className="flex flex-col gap-3">
            <SectionTitle>Estadísticas</SectionTitle>
            <ProfileStatsRows stats={guestStats} />
          </section>
        )}

        <Card className="flex flex-col gap-3">
          <SectionTitle>Estás jugando como invitado</SectionTitle>
          <p className="text-sm text-fg-muted">
            Tenés un jugador con el look por defecto y podés jugar todas las salas. Nada se
            guarda: creá una cuenta para tener tu avatar a medida, tu historial y tus stats.
          </p>
          <Link
            href="/register"
            className={buttonVariants({ variant: "primary", size: "sm", className: "self-start" })}
          >
            Creá una cuenta
          </Link>
        </Card>

        <LogoutButton className="self-center" />
      </div>
    );
  }

  // Todo independiente → en paralelo. El email de recuperación se edita acá mismo: lectura fresca
  // de Auth (el JWT puede tenerlo viejo hasta refrescarse).
  const [{ data: profile }, history, { data: profileStats }, meta, { data: ranked }] = await Promise.all([
    supabase.from("profiles").select("username").eq("id", user.id).single(),
    getTournamentHistory(supabase, user.id),
    supabase.rpc("get_profile_stats"),
    freshUserMetadata(),
    supabase.rpc("get_ranked_me"),
  ]);
  const recoveryEmailRaw = meta.recovery_email;
  const recoveryEmail =
    typeof recoveryEmailRaw === "string" && recoveryEmailRaw ? recoveryEmailRaw : null;
  const stats = aggregateStats(history);

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-8 px-6 py-6">

      <div className="flex flex-col gap-1">
        <Eyebrow>Perfil</Eyebrow>
        <h2 className="font-display text-5xl font-black uppercase leading-[0.9] text-fg">
          {profile?.username ?? "Jugador"}
        </h2>
      </div>

      {ranked && <LeagueCard ranked={ranked} />}

      {/* Tarea 4: orden Estadísticas → Historial → Tu jugador → Email de recuperación. */}
      <section className="flex flex-col gap-3">
        <SectionTitle>Estadísticas</SectionTitle>
        <div className="grid grid-cols-2 gap-3">
          <StatCard label="Títulos" value={stats.titles} />
          <StatCard label="Torneos jugados" value={stats.tournamentsPlayed} />
          <StatCard label="Victorias" value={`${Math.round(stats.winRate * 100)}%`} />
          <StatCard label="Goles" value={stats.goals} />
        </div>
        {profileStats && <ProfileStatsRows stats={profileStats} />}
      </section>

      <section className="flex flex-col gap-3">
        <SectionTitle>Historial</SectionTitle>
        {history.length === 0 ? (
          <Card variant="bare" className="border border-dashed border-border p-6 text-center">
            <p className="text-sm text-fg-muted">
              Todavía no jugaste ningún torneo. Tocá Jugar para arrancar tu primera tanda.
            </p>
          </Card>
        ) : (
          <>
            {/* T13: en el perfil solo los últimos 5; el resto, en la pantalla de historial completo. */}
            <ul className="flex flex-col gap-3">
              {history.slice(0, 5).map((h) => (
                <li key={h.tournamentId}>
                  <HistoryEntryCard entry={h} />
                </li>
              ))}
            </ul>
            {history.length > 5 && (
              <Link
                href="/perfil/historial"
                className={buttonVariants({
                  variant: "outline",
                  size: "sm",
                  className: "self-center",
                })}
              >
                Ver historial completo
              </Link>
            )}
          </>
        )}
      </section>

      <Card className="flex flex-col gap-3">
        <SectionTitle>Tu jugador</SectionTitle>
        <p className="text-sm text-fg-muted">
          Es el mismo que patea y ataja los penales. En cada partido viste la camiseta de la
          selección que te toca.
        </p>
        <Link
          href="/avatar"
          className={buttonVariants({ variant: "primary", size: "sm", className: "self-start" })}
        >
          Editar jugador
        </Link>
      </Card>

      <Card className="flex flex-col gap-3">
        <SectionTitle>Email de recuperación</SectionTitle>
        <RecoveryEmailForm initialEmail={recoveryEmail} />
      </Card>

      <LogoutButton className="self-center" />
    </div>
  );
}
