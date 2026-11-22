import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/supabase/session";
import { seasonName } from "@/lib/engine/ranked";
import { divisionById, type RankingRow } from "@/lib/ranked/types";
import { DivisionCrest } from "@/components/ranked/DivisionCrest";
import { buttonVariants } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Eyebrow } from "@/components/ui/Typography";
import { Page } from "@/components/ui/Page";

export const metadata: Metadata = { title: "Ranking de jugadores", robots: { index: false, follow: false } };

function Row({ r }: { r: RankingRow }) {
  return (
    <li
      className={`grid grid-cols-[2.25rem_1.75rem_1fr_auto] items-center gap-2 border-b border-border px-3 py-2 last:border-b-0 ${
        r.is_me ? "bg-ink text-bg" : ""
      }`}
    >
      <span className="font-display text-xl font-black tabular-nums">{r.position}</span>
      <DivisionCrest id={r.division} className="h-7" />
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-sm font-bold">{r.username}</span>
        <span className={`truncate text-xs font-semibold uppercase tracking-[0.04em] ${r.is_me ? "opacity-75" : "text-fg-muted"}`}>
          {divisionById(r.division).name} · {r.wins}/{r.games} G
        </span>
      </span>
      <span className="font-mono text-base font-bold">{r.rating}</span>
    </li>
  );
}

/** Tabla de posiciones ranked de la temporada en curso (top 50 + tu puesto). */
export default async function RankingPage() {
  const { supabase, user } = await getSession();
  if (!user) redirect("/login");

  const { data } = await supabase.rpc("get_ranking", { p_limit: 50 });
  const rows = data?.rows ?? [];
  const me = data?.me ?? null;
  const meInTop = rows.some((r) => r.is_me);

  return (
    <Page>
      <div className="flex items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <Eyebrow>Ranked</Eyebrow>
          <h2 className="font-display text-4xl font-black uppercase leading-[0.9] text-fg">
            {data ? seasonName(data.season_id) : "Temporada"}
          </h2>
        </div>
        <Link href="/ranked" className={buttonVariants({ variant: "primary", size: "sm" })}>
          Jugar ranked
        </Link>
      </div>

      {rows.length === 0 ? (
        <Card variant="bare" className="border-2 border-dashed border-ink p-6 text-center">
          <p className="text-sm text-fg-muted">
            Todavía nadie jugó ranked esta temporada. El primer puesto está libre.
          </p>
        </Card>
      ) : (
        <Card padding="none" className="overflow-hidden">
          <ol>
            {rows.map((r) => (
              <Row key={r.position} r={r} />
            ))}
          </ol>
        </Card>
      )}

      {me && !meInTop && (
        <Card padding="none" className="overflow-hidden">
          <ol>
            <Row r={me} />
          </ol>
        </Card>
      )}

      <p className="text-center text-xs text-fg-subtle">
        Temporadas por torneo: Apertura (ene–jun) y Clausura (jul–dic). Al cerrar, tu mejor división
        queda en tu perfil y los puntos se acercan a 1500.
      </p>
    </Page>
  );
}
