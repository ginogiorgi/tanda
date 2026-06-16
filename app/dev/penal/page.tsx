import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PenalDevHarness } from "@/components/penal/PenalDevHarness";

/**
 * Página DEV (temporal, se reemplaza en F5/F8) para ejercitar el Broadcast `penal:start`
 * de la 4.3 sin `start_tournament`. Auth-gated igual que `/avatar` y `/sala/[code]`.
 */
export default async function DevPenalPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <main className="flex min-h-dvh w-full flex-col items-center justify-center gap-8 px-6 py-12">
      <PenalDevHarness />
    </main>
  );
}
