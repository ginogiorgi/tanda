import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/supabase/session";
import { RankedQueue } from "@/components/ranked/RankedQueue";

export const metadata: Metadata = { title: "Ranked", robots: { index: false, follow: false } };

/**
 * Cola ranked 1v1 (Fase 4b). Server Component: trae la ficha de liga del jugador y monta la cola
 * (cliente). Auth-gated: los invitados son usuarios anónimos → también juegan ranked.
 */
export default async function RankedPage() {
  const { supabase, user } = await getSession();
  if (!user) redirect("/login");

  const { data: me } = await supabase.rpc("get_ranked_me");
  if (!me) redirect("/jugar?aviso=no_match");

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col">
      <RankedQueue me={me} />
    </div>
  );
}
