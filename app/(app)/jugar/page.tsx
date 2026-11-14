import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/supabase/session";
import { PlayMenu } from "@/components/lobby/PlayMenu";
import { ROOM_ERROR_MESSAGES } from "@/lib/errors";
import { MODE_LIST, isModeId, type ModeId } from "@/lib/modes";

export const metadata: Metadata = { title: "Jugar", robots: { index: false, follow: false } };

/**
 * Jugar (feedback 14/11): los caminos para entrar a una partida, en su propia pantalla (con volver,
 * linkeable y con `loading`), en vez de amontonados en la home. Las pantallas de juego que no pueden
 * arrancar (sala inexistente, sin partido) vuelven acá con `?aviso=`.
 */
export default async function JugarPage({
  searchParams,
}: {
  searchParams: Promise<{ aviso?: string }>;
}) {
  const { supabase, user } = await getSession();
  if (!user) redirect("/login");

  const { aviso } = await searchParams;
  const avisoMsg = aviso ? ROOM_ERROR_MESSAGES[aviso] : null;

  const [modesRes, rankedRes] = await Promise.all([
    supabase.from("game_modes").select("id").eq("active", true).order("sort"),
    supabase.rpc("get_ranked_me"),
  ]);
  if (modesRes.error) console.error("[jugar] game_modes", modesRes.error.code, modesRes.error.message);
  if (rankedRes.error) console.error("[jugar] get_ranked_me", rankedRes.error.code, rankedRes.error.message);
  // Si `game_modes` falla, se ofrecen los del registro (create_room/quick_play igual rechazan un modo
  // inactivo en el server) en vez de dejar todo en "Próximamente".
  const activeModes: ModeId[] = modesRes.error
    ? MODE_LIST.map((m) => m.id)
    : (modesRes.data ?? []).map((m) => m.id).filter(isModeId);

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-6 px-6 py-6">
      {avisoMsg && (
        <p className="rounded-[4px] border-2 border-ink bg-bg-elevated px-3 py-2 text-sm font-semibold text-brand-ink">
          {avisoMsg}
        </p>
      )}
      <PlayMenu activeModes={activeModes} ranked={rankedRes.data ?? null} />
    </div>
  );
}
