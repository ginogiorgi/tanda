import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PenalLive } from "@/components/penal/PenalLive";
import type { ActiveMatch } from "@/lib/realtime/penal";

/**
 * Pantalla de partido real (F8 8.2). Resuelve el partido en curso del usuario con `get_active_match`
 * (no recibe matchId por URL — es el partido activo del caller) y monta `<PenalLive>`, que arma la
 * escena 3D + la tarjeta de penal. Si no hay partido activo, vuelve al home. Reemplaza al harness
 * temporal de `/dev/penal`. Auth-gated (los invitados son usuarios anónimos → pasan).
 */
export default async function PartidoPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data } = await supabase.rpc("get_active_match");
  const active = data as ActiveMatch | null;
  if (!active?.match_id) redirect("/?aviso=no_match");

  return (
    <main className="flex min-h-dvh w-full flex-col items-center justify-center gap-8 px-6 py-12">
      <PenalLive matchId={active.match_id} />
    </main>
  );
}
