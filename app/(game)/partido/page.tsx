import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/supabase/session";
import { TournamentLive } from "@/components/penal/TournamentLive";
import { RankedLive } from "@/components/ranked/RankedLive";

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
  const { supabase, user } = await getSession();
  if (!user) redirect("/login");

  // Ranked (Fase 4b) usa el mismo stack pero su propia pantalla (cara a cara + puntos de liga).
  const { data } = await supabase.rpc("get_active_tournament");
  if (!data?.tournament_id) redirect("/?aviso=no_match");

  return (
    // Pantalla fija (layout de juego): la vista del penal ocupa el viewport; el bracket y los resúmenes,
    // si no entran, scrollean solo este panel — nunca la página.
    <div className="flex min-h-0 w-full flex-1 flex-col items-center overflow-y-auto overscroll-contain px-4 py-6">
      <div className="my-auto flex w-full flex-col items-center gap-6">
        {data.mode_id === "ranked" ? (
          <RankedLive tournamentId={data.tournament_id} />
        ) : (
          <TournamentLive tournamentId={data.tournament_id} isGuest={user.isAnonymous} />
        )}
      </div>
    </div>
  );
}
