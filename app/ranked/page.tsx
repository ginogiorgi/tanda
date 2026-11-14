import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { RankedQueue } from "@/components/ranked/RankedQueue";

export const metadata: Metadata = { title: "Ranked", robots: { index: false, follow: false } };

/**
 * Cola ranked 1v1 (Fase 4b). Server Component: trae la ficha de liga del jugador y monta la cola
 * (cliente). Auth-gated: los invitados son usuarios anónimos → también juegan ranked.
 */
export default async function RankedPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: me } = await supabase.rpc("get_ranked_me");
  if (!me) redirect("/?aviso=no_match");

  return (
    <main className="flex min-h-0 w-full flex-1 flex-col items-center overflow-y-auto px-4 py-10">
      <div className="my-auto flex w-full flex-col items-center">
        <RankedQueue me={me} />
      </div>
    </main>
  );
}
