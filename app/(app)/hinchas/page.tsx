import type { Metadata } from "next";
import { getSession } from "@/lib/supabase/session";
import { FanFavorites } from "@/components/fans/FanFavorites";
import { FanRankingList } from "@/components/fans/FanRankingList";
import { Eyebrow } from "@/components/ui/Typography";
import { Page } from "@/components/ui/Page";

export const metadata: Metadata = {
  title: "Ranking de hinchas",
  description: "Qué selecciones y qué clubes tienen más hinchas en Tanda.",
  alternates: { canonical: "/hinchas" },
};

/** Ranking de hinchas (feedback 3 #15): tus favoritos arriba, los rankings de países y de clubes abajo. */
export default async function HinchasPage() {
  const { supabase, user } = await getSession();
  const { data, error } = await supabase.rpc("get_fan_ranking");
  if (error) console.error("[hinchas] get_fan_ranking", error.code, error.message);
  const registered = Boolean(user && !user.isAnonymous);

  return (
    <Page>
      <div className="flex flex-col gap-1">
        <Eyebrow>La tribuna de Tanda</Eyebrow>
        <h2 className="font-display text-4xl font-black uppercase leading-[0.9] text-fg">Ranking de hinchas</h2>
      </div>

      <FanFavorites
        registered={registered}
        isGuest={user?.isAnonymous === true}
        club={data?.mine?.club ?? null}
        nation={data?.mine?.nation ?? null}
      />

      {data ? (
        <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-2">
          <FanRankingList title="Países" rows={data.nations} mine={data.mine?.nation ?? null} />
          <FanRankingList title="Clubes" rows={data.clubs} mine={data.mine?.club ?? null} />
        </div>
      ) : (
        <p className="text-sm text-fg-subtle">No pudimos cargar el ranking. Recargá la página.</p>
      )}
    </Page>
  );
}
