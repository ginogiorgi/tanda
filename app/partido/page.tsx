import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { TournamentLive } from "@/components/penal/TournamentLive";

// Privada y por usuario → fuera del índice (D2; robots.txt ya la bloquea, esto es el refuerzo a nivel meta).
export const metadata: Metadata = { robots: { index: false, follow: false } };

/**
 * Pantalla de partido/torneo real (F8 8.2/8.5). Tournament-scoped: te sigue de grupos a la final.
 * Resuelve el torneo en curso del caller con `get_active_tournament` (sobrevive al hueco entre
 * partidos, a diferencia de un match puntual) y monta `<TournamentLive>`, que alterna entre la
 * tarjeta de penal + escena 3D y el bracket en vivo según el reloj de ronda. Si no hay torneo
 * activo, vuelve al home. Auth-gated (los invitados son usuarios anónimos → pasan).
 */
export default async function PartidoPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data } = await supabase.rpc("get_active_tournament");
  const active = data as { tournament_id: string } | null;
  if (!active?.tournament_id) redirect("/?aviso=no_match");

  return (
    <main className="flex min-h-dvh w-full flex-col items-center justify-center gap-6 px-6 py-12">
      <TournamentLive
        tournamentId={active.tournament_id}
        isGuest={user.is_anonymous === true}
      />
    </main>
  );
}
