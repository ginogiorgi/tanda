/**
 * Shapes de las RPC ranked (Fase 4b) + helpers de presentación. La regla vive en
 * `lib/engine/ranked.ts`; acá solo lo que viaja del server y cómo se nombra.
 */
import { DIVISIONS, type Division, type DivisionId } from "@/lib/engine/ranked";

export type { DivisionId };

/** `get_ranked_me()`: la ficha de liga del jugador. */
export interface RankedMe {
  rating: number;
  shield: number;
  games: number;
  wins: number;
  season_id: string;
  season_games: number;
  season_wins: number;
  /** Puesto en la tabla de la temporada (null si todavía no jugó esta temporada). */
  position: number | null;
}

/** `ranked_enqueue()` / `ranked_poll()`. */
export type RankedPoll =
  | { status: "idle" }
  | { status: "matched"; tournament_id: string }
  | { status: "busy"; tournament_id: string; mode_id: string }
  | {
      status: "queued";
      waited_ms: number;
      rating: number;
      server_now: string;
    };

export interface RankedSideResult {
  delta: number;
  rating: number;
  promoted: boolean;
  demoted: boolean;
  shield_saved: boolean;
  shield: number;
}

export interface RankedSide {
  participant_id: string;
  username: string;
  /** Crudo de `profiles.avatar` (v2): se lee con `parseAvatar`. */
  avatar: unknown;
  /** Rating de ENTRADA al partido. */
  rating: number;
}

/** `get_ranked_match(p_tournament)`. */
export interface RankedMatchView {
  tournament_id: string;
  season_id: string;
  status: "pending" | "in_progress" | "finished";
  /** Fin de la presentación (primer penal), o null. */
  starts_at: string | null;
  server_now: string;
  settled: boolean;
  won: boolean | null;
  my_score: number;
  opp_score: number;
  me: RankedSide & { stakes: { win: number; loss: number }; result: RankedSideResult | null };
  opp: RankedSide;
}

export interface RankingRow {
  position: number;
  username: string;
  rating: number;
  division: DivisionId;
  games: number;
  wins: number;
  is_me: boolean;
}

/** `get_ranking()`. */
export interface Ranking {
  season_id: string;
  rows: RankingRow[];
  me: RankingRow | null;
}

export interface CupCount {
  gold: number;
  silver: number;
  bronze: number;
}

/** `get_profile_stats()`. */
export interface ProfileStats {
  /** Una ficha por temporada CERRADA: la división final (premio, tabla `awards`). Recientes primero. */
  seasons: { season_id: string; division: DivisionId }[];
  /** Temporada en curso (no es premio): división actual, si jugó alguna ranked en ella. */
  current: { season_id: string; division: DivisionId; games: number } | null;
  cups: Partial<Record<"worldcup" | "arg", CupCount>>;
  ranked: { games: number; wins: number; rating: number } | null;
}

const BY_ID = new Map<string, Division>(DIVISIONS.map((d) => [d.id, d]));

export function divisionById(id: string): Division {
  return BY_ID.get(id) ?? DIVISIONS[0]!;
}

/** "+16" / "−18" con signo tipográfico. */
export function signed(n: number): string {
  return n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : "±0";
}
