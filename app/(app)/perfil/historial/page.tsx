import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/supabase/session";
import { getTournamentHistory } from "@/lib/profile/queries";
import { HistoryPager } from "@/components/profile/HistoryPager";
import { Card } from "@/components/ui/Card";
import { Eyebrow } from "@/components/ui/Typography";
import { Page } from "@/components/ui/Page";

// Privada y por usuario → noindex (D2).
export const metadata: Metadata = { robots: { index: false, follow: false } };

/**
 * Historial completo de torneos del jugador, paginado de a 5 (T13). El perfil muestra solo los
 * últimos 5 y enlaza acá. Auth-gated; los invitados (sin historial) vuelven al perfil.
 */
export default async function HistorialPage() {
  const { supabase, user } = await getSession();
  if (!user) redirect("/login");
  if (user.isAnonymous) redirect("/perfil");

  const history = await getTournamentHistory(supabase, user.id);

  return (
    <Page className="gap-8">
      <div className="flex flex-col gap-1">
        <Eyebrow>Historial completo</Eyebrow>
        <h2 className="font-display text-4xl font-black uppercase leading-[0.9] text-fg">
          Tus torneos
        </h2>
      </div>

      {history.length === 0 ? (
        <Card variant="bare" className="border border-dashed border-border p-6 text-center">
          <p className="text-sm text-fg-muted">
            Todavía no jugaste ningún torneo. Tocá Jugar para arrancar tu primera tanda.
          </p>
        </Card>
      ) : (
        <HistoryPager entries={history} />
      )}
    </Page>
  );
}
