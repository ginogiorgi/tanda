import { notFound } from "next/navigation";
import type { Metadata } from "next";
import wcTeams from "@/data/teams/worldcup.json";
import { Page } from "@/components/ui/Page";
import { RunSummary } from "@/components/penal/RunSummary";
import type { BracketSnapshot, BracketTeam } from "@/lib/bracket/bracket";
import type { KitPattern } from "@/lib/realtime/score";

export const metadata: Metadata = { robots: { index: false, follow: false } };

interface CatalogTeam {
  code: string;
  name: string;
  short_name: string;
  accent_color: string;
  flag_asset: string | null;
  crest_asset: string | null;
  kit_pattern: string;
  kit_primary: string;
  kit_secondary: string;
  kit_tertiary: string | null;
}

function team(t: CatalogTeam | undefined, placement: number | null, mine: boolean): BracketTeam {
  if (!t) throw new Error("fixture: catálogo vacío");
  return {
    participant_id: `p-${t.code}`,
    user_id: mine ? "u-me" : null,
    is_bot: !mine,
    team_id: `t-${t.code}`,
    team_code: t.code,
    team_name: t.name,
    team_short: t.short_name,
    flag: t.flag_asset,
    crest: t.crest_asset,
    kit_primary: t.kit_primary,
    kit_secondary: t.kit_secondary,
    kit_tertiary: t.kit_tertiary,
    kit_pattern: t.kit_pattern as KitPattern,
    accent: t.accent_color,
    group_letter: "A",
    placement,
    eliminated_phase: null,
  };
}

/**
 * Banco de la pantalla de fin de torneo (feedback 3 #6): `RunSummary` con una final del Mundial
 * ganada (`?place=1`, default) o perdida (`?place=2`), sin jugar 15 minutos. 404 en producción.
 */
export default async function ChampionDevPage({ searchParams }: { searchParams: Promise<{ place?: string }> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const won = (await searchParams).place !== "2";
  const teams = wcTeams as CatalogTeam[];
  const me = team(teams[0], won ? 1 : 2, true);
  const rival = team(teams[5], won ? 2 : 1, false);
  const snapshot: BracketSnapshot = {
    tournament_id: "t-dev",
    mode_id: "worldcup",
    format: { qualifiers_per_zone: 2, best_thirds: 8, knockout_start: "round_of_32", third_place: true, tiebreak: "gd_h2h" },
    my_participant_id: me.participant_id,
    current_phase: "finished",
    round_deadline: null,
    champion_participant_id: won ? me.participant_id : rival.participant_id,
    participants: [me, rival],
    matches: [
      {
        match_id: "00000000-0000-0000-0000-000000000000",
        phase: "final",
        group_letter: null,
        bracket_slot: 0,
        status: "finished",
        home_score: won ? 4 : 2,
        away_score: won ? 3 : 3,
        winner_participant_id: won ? me.participant_id : rival.participant_id,
        home: me,
        away: rival,
        server_now: "2026-11-19T00:00:00Z",
      },
    ],
  };
  return (
    <Page center>
      <RunSummary snapshot={snapshot} myParticipantId={me.participant_id} isGuest />
    </Page>
  );
}
