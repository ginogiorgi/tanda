import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { seasonName } from "@/lib/engine/ranked";
import { divisionById, type RankingRow } from "@/lib/ranked/types";
import { DivisionCrest } from "@/components/ranked/DivisionCrest";
import { buttonVariants } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Eyebrow } from "@/components/ui/Typography";

export const metadata: Metadata = { title: "Tabla ranked", robots: { index: false, follow: false } };

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
        <span className={`text-[10px] font-semibold uppercase tracking-[0.1em] ${r.is_me ? "opacity-75" : "text-fg-muted"}`}>
          {divisionById(r.division).name} · {r.wins}/{r.games} G{r.placement ? " · ubicación" : ""}
        </span>
      </span>
      <span className="font-mono text-base font-bold">{r.rating}</span>
    </li>
  );
}

/** Tabla de posiciones ranked de la temporada en curso (top 50 + tu puesto). */
export default async function RankingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data } = await supabase.rpc("get_ranking", { p_limit: 50 });
  const rows = data?.rows ?? [];
  const me = data?.me ?? null;
  const meInTop = rows.some((r) => r.is_me);

  return (
    <main className="mx-auto flex min-h-0 w-full max-w-md flex-1 flex-col gap-6 overflow-y-auto px-4 py-10">
      <nav className="flex items-center justify-between">
        <Link href="/" className={buttonVariants({ variant: "ghost", size: "sm" })}>
          ← Inicio
        </Link>
        <Link href="/ranked" className={buttonVariants({ variant: "primary", size: "sm" })}>
          Jugar ranked
        </Link>
      </nav>

      <div className="flex flex-col gap-1">
        <Eyebrow>Ranked · {data ? seasonName(data.season_id) : "Temporada"}</Eyebrow>
        <h1 className="font-display text-5xl font-black uppercase leading-[0.9] text-fg">Tabla</h1>
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
    </main>
  );
}
