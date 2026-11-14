import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getTournamentHistory } from "@/lib/profile/queries";
import { HistoryPager } from "@/components/profile/HistoryPager";
import { Card } from "@/components/ui/Card";
import { Eyebrow } from "@/components/ui/Typography";
import { buttonVariants } from "@/components/ui/Button";

// Privada y por usuario → noindex (D2).
export const metadata: Metadata = { robots: { index: false, follow: false } };

/**
 * Historial completo de torneos del jugador, paginado de a 5 (T13). El perfil muestra solo los
 * últimos 5 y enlaza acá. Auth-gated; los invitados (sin historial) vuelven al perfil.
 */
export default async function HistorialPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (user.is_anonymous) redirect("/perfil");

  const history = await getTournamentHistory(supabase, user.id);

  return (
    <main className="mx-auto flex min-h-0 w-full max-w-md flex-1 flex-col gap-8 overflow-y-auto px-6 py-12">
      <nav className="flex items-center justify-between">
        <Link href="/perfil" className={buttonVariants({ variant: "ghost", size: "sm" })}>
          ← Perfil
        </Link>
      </nav>

      <div className="flex flex-col gap-1">
        <Eyebrow>Historial completo</Eyebrow>
        <h1 className="font-display text-4xl font-extrabold uppercase tracking-tight text-brand">
          Tus torneos
        </h1>
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
    </main>
  );
}
