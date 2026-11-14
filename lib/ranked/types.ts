/**
 * Shapes de las RPC ranked (Fase 4b) + helpers de presentación. La regla vive en
 * `lib/engine/ranked.ts`; acá solo lo que viaja del server y cómo se nombra.
 */
import type { AvatarConfig } from "@/lib/avatar/types";
import { DIVISIONS, type Division, type DivisionId } from "@/lib/engine/ranked";

export type { DivisionId };

/** `get_ranked_me()`: la ficha de liga del jugador. */
export interface RankedMe {
  rating: number;
  placement_left: number;
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
      /** Ventana de rating aceptada hoy (null = cualquiera). */
      window: number | null;
      rating: number;
      in_queue: number;
      server_now: string;
    };

export interface RankedSideResult {
  delta: number;
  rating: number;
  promoted: boolean;
  demoted: boolean;
  shield_saved: boolean;
  shield: number;
  placement_left: number;
}

export interface RankedSide {
  participant_id: string;
  username: string;
  avatar: AvatarConfig | Record<string, never>;
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
  /** Todavía en partidas de ubicación. */
  placement: boolean;
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
  divisions: { id: DivisionId; season_id: string | null }[];
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
