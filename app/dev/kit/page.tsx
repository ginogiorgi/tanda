import { notFound } from "next/navigation";
import type { Metadata } from "next";
import argTeams from "@/data/teams/arg.json";
import wcTeams from "@/data/teams/worldcup.json";
import { Wordmark } from "@/components/brand/Wordmark";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { ScorePill } from "@/components/ui/ScorePill";
import { StatCard } from "@/components/ui/StatCard";
import { Input, Field } from "@/components/ui/Input";
import { Eyebrow, SectionTitle } from "@/components/ui/Typography";
import { PenalHud } from "@/components/penal/PenalHud";
import { TimeBar } from "@/components/penal/TimeBar";
import { TeamReveal } from "@/components/penal/TeamReveal";
import { ResultCard } from "@/components/penal/ResultCard";
import { Bracket } from "@/components/bracket/Bracket";
import { PlayMenu } from "@/components/lobby/PlayMenu";
import { HistoryEntryCard } from "@/components/profile/HistoryEntryCard";
import { buildBracketView, type BracketSnapshot, type BracketTeam } from "@/lib/bracket/bracket";
import type { KitPattern, ParticipantBrief, ScoreLivePayload } from "@/lib/realtime/score";
import { DivisionProgress } from "@/components/ranked/DivisionProgress";
import { RankedResult } from "@/components/ranked/RankedResult";
import { ProfileStatsRows } from "@/components/profile/ProfileStatsRows";
import type { RankedMatchView } from "@/lib/ranked/types";

const RANKED_VIEW: RankedMatchView = {
  tournament_id: "t-rk",
  season_id: "clausura-2026",
  status: "finished",
  starts_at: null,
  server_now: "2026-11-13T00:00:00Z",
  settled: true,
  won: true,
  my_score: 4,
  opp_score: 3,
  me: {
    participant_id: "p1",
    username: "gino",
    avatar: {},
    rating: 1588,
    stakes: { win: 18, loss: -14 },
    result: { delta: 18, rating: 1606, promoted: true, demoted: false, shield_saved: false, shield: 3 },
  },
  opp: { participant_id: "p2", username: "jm10", avatar: {}, rating: 1640 },
};

/**
 * Kit visual de desarrollo (rebrand "B · Programa"): todas las primitivas y pantallas clave con datos de
 * fixture, para revisar el diseño sin jugar un torneo real. **Solo en desarrollo** (404 en producción).
 */
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

/** Índice garantizado (fixtures): falla fuerte si el catálogo cambia de tamaño. */
function at<T>(xs: readonly T[], i: number): T {
  const x = xs[i];
  if (x === undefined) throw new Error(`fixture fuera de rango: ${i}`);
  return x;
}

function brief(t: CatalogTeam, i: number): ParticipantBrief {
  return {
    participant_id: `p-${t.code}`,
    user_id: i === 0 ? "u-me" : null,
    is_bot: i !== 0,
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
  };
}

/** Zonas AR de 15 con la fecha 3 jugada (resultados deterministas por índice). */
function argSnapshot(): BracketSnapshot {
  const teams = (argTeams as CatalogTeam[]).map(brief);
  const participants: BracketTeam[] = teams.map((b, i) => ({
    ...b,
    group_letter: i % 2 === 0 ? "A" : "B",
    placement: null,
    eliminated_phase: null,
  }));
  const matches: ScoreLivePayload[] = [];
  for (const zone of ["A", "B"]) {
    const z = participants.filter((p) => p.group_letter === zone);
    for (let r = 0; r < 3; r++) {
      for (let k = 0; k < 7; k++) {
        const h = at(z, (k + r) % 15);
        const a = at(z, (14 - k + r) % 15);
        if (h === a) continue;
        const hs = (k * 7 + r * 3) % 4;
        const as_ = (k * 5 + r) % 3;
        matches.push({
          match_id: `m-${zone}-${r}-${k}`,
          phase: "group",
          group_letter: zone,
          bracket_slot: k,
          status: "finished",
          home_score: hs,
          away_score: as_,
          winner_participant_id: hs > as_ ? h.participant_id : as_ > hs ? a.participant_id : null,
          home: h,
          away: a,
          server_now: "2026-11-13T00:00:00Z",
        });
      }
    }
  }
  const me = at(participants, 0);
  const opp = at(participants, 2);
  matches.push({
    match_id: "m-next",
    phase: "group",
    group_letter: "A",
    bracket_slot: 99,
    status: "pending",
    home_score: 0,
    away_score: 0,
    winner_participant_id: null,
    home: me,
    away: opp,
    server_now: "2026-11-13T00:00:00Z",
  });
  return {
    tournament_id: "t-kit",
    mode_id: "arg",
    format: { qualifiers_per_zone: 8, best_thirds: 0, knockout_start: "round_of_16", third_place: false, tiebreak: "goals" },
    my_participant_id: me.participant_id,
    current_phase: "groups",
    round_deadline: null,
    champion_participant_id: null,
    participants,
    matches,
  };
}

export default function KitPage() {
  if (process.env.NODE_ENV === "production") notFound();

  const boca = brief(at(argTeams as CatalogTeam[], 0), 0);
  const river = brief(at(argTeams as CatalogTeam[], 1), 1);
  const arg = brief(at(wcTeams as CatalogTeam[], 0), 0);
  const snap = argSnapshot();
  const view = buildBracketView(snap, {});
  const me: BracketTeam = { ...boca, group_letter: "A", placement: null, eliminated_phase: null };
  const meWc: BracketTeam = { ...arg, group_letter: "C", placement: null, eliminated_phase: null };

  return (
    <main className="flex min-h-0 w-full flex-1 flex-col items-center gap-10 overflow-y-auto px-4 py-10">
      <section className="flex w-full max-w-md flex-col gap-4">
        <Eyebrow>Kit · Programa</Eyebrow>
        <Wordmark className="text-7xl" />
        <SectionTitle>Primitivas</SectionTitle>
        <div className="flex flex-col gap-3">
          <Button block size="lg">Jugar</Button>
          <Button block size="lg" variant="outline">Crear sala</Button>
          <div className="flex gap-3">
            <Button variant="danger">Abandonar</Button>
            <Button variant="ghost">Volver</Button>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge>Neutral</Badge>
          <Badge variant="brand">⚽ Pateás</Badge>
          <Badge variant="blue">🧤 Atajás</Badge>
          <Badge variant="success">Ganaste</Badge>
          <Badge variant="danger">Perdiste</Badge>
        </div>
        <div className="flex items-center gap-2">
          <ScorePill size="lg">2</ScorePill>
          <ScorePill tone="brand" size="lg">1</ScorePill>
          <ScorePill tone="muted" size="md">0</ScorePill>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <StatCard label="Títulos" value={3} />
          <StatCard label="Goles" value={41} />
          <StatCard label="% victorias" value="62%" />
        </div>
        <Card>
          <Field label="Usuario" htmlFor="kit-u" hint="Entre 3 y 20 caracteres.">
            <Input id="kit-u" placeholder="tu_usuario" />
          </Field>
        </Card>
      </section>

      <section className="flex w-full max-w-md flex-col gap-4">
        <SectionTitle>Jugar</SectionTitle>
        <PlayMenu activeModes={["worldcup", "arg"]} />
      </section>

      <section className="flex w-full max-w-md flex-col gap-4">
        <SectionTitle>Ranked</SectionTitle>
        <Card className="flex flex-col gap-4">
          <DivisionProgress rating={1525} shield={2} />
          <DivisionProgress rating={1712} shield={2} compact />
        </Card>
        <RankedResult view={RANKED_VIEW} result={RANKED_VIEW.me.result!} />
        <Card>
          <ProfileStatsRows
            stats={{
              seasons: [
                { season_id: "apertura-2027", division: "primera" },
                { season_id: "clausura-2026", division: "ascenso" },
              ],
              current: { season_id: "clausura-2027", division: "libertadores", games: 9 },
              cups: { worldcup: { gold: 2, silver: 1, bronze: 0 }, arg: { gold: 0, silver: 3, bronze: 4 } },
              ranked: { games: 12, wins: 8, rating: 1606 },
            }}
          />
        </Card>
      </section>

      <section className="flex w-full max-w-md flex-col gap-4">
        <SectionTitle>Penal</SectionTitle>
        <Card className="flex flex-col gap-4">
          <PenalHud
            home={boca}
            away={river}
            homeScore={2}
            awayScore={1}
            idx={5}
            role="kick"
            dots={[
              { idx: 1, scored: true },
              { idx: 2, scored: true },
              { idx: 3, scored: true },
              { idx: 4, scored: false },
            ]}
            kicksPerSide={5}
          />
          <TimeBar fraction={0.55} />
        </Card>
      </section>

      <section className="flex w-full max-w-md flex-col items-center gap-6">
        <SectionTitle className="self-stretch">Te tocó</SectionTitle>
        <TeamReveal me={me} />
        <TeamReveal me={meWc} />
      </section>

      <section className="flex w-full max-w-md flex-col gap-4">
        <SectionTitle>Resultado</SectionTitle>
        <ResultCard
          caption="Octavos"
          left={{ code: boca.team_code, kit: boca.kit_primary, crest: boca.crest, isMe: true }}
          right={{ code: river.team_code, kit: river.kit_primary, crest: river.crest }}
          leftScore={4}
          rightScore={3}
          outcome="won"
        />
        <HistoryEntryCard
          entry={{
            tournamentId: "t1",
            modeId: "worldcup",
            teamName: "Argentina",
            teamCode: "ARG",
            teamFlag: "ar",
            teamCrest: null,
            kitPrimary: "#75AADB",
            placement: 2,
            eliminatedPhase: "final",
            goalsFor: 14,
            matchesPlayed: 7,
            matchesWon: 5,
            abandoned: false,
            playedAt: "2026-11-12T20:00:00Z",
            finalPhase: "final",
            finalMyScore: 3,
            finalOppScore: 4,
            finalOppTeamCode: "FRA",
            finalOppFlag: "fr",
            finalOppCrest: null,
            finalOppKitPrimary: "#1F3FA8",
            outcome: "lost",
          }}
        />
      </section>

      <section className="flex w-full flex-col items-center gap-4">
        <SectionTitle className="w-full max-w-md">Zonas (AR)</SectionTitle>
        <Bracket view={view} />
      </section>
    </main>
  );
}
