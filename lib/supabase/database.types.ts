/**
 * Tipos de la base para el cliente de Supabase. El CLI nuevo exige login de plataforma para
 * `gen types`, así que este `Database` se mantiene a mano (es chico: 3 tablas consultadas por
 * `.from` + las RPC del cliente). Tiparlo hace que `supabase.rpc("...")` valide el NOMBRE y los
 * ARGS en compilación, y tipa el `data` con nuestros shapes reales (los `jsonb` se mapean a los
 * tipos de `lib/...`, no a `Json` genérico). Fuente de verdad del esquema: `supabase/migrations/`.
 */
import type { ActiveMatch, MatchScene, PenalResultPayload } from "@/lib/realtime/penal";
import type { BracketSnapshot } from "@/lib/bracket/bracket";
import type { TournamentHistoryEntry } from "@/lib/profile/history";
import type { ModeId } from "@/lib/engine/formats";
import type { FanRanking, LobbyFavorite } from "@/lib/fans/catalog";
import type { ProfileStats, Ranking, RankedMatchView, RankedMe, RankedPoll } from "@/lib/ranked/types";

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

type RoomRef = { room_id: string; tournament_id: string; code: string };
type Empty = Record<PropertyKey, never>;

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: { id: string; username: string; avatar: unknown; created_at: string; updated_at: string };
        Insert: { id: string; username: string; avatar?: unknown; created_at?: string; updated_at?: string };
        Update: { id?: string; username?: string; avatar?: unknown; created_at?: string; updated_at?: string };
        Relationships: [];
      };
      rooms: {
        Row: { id: string; code: string; host_id: string | null; status: string; starts_at: string; created_at: string; mode_id: ModeId };
        Insert: { id?: string; code: string; host_id?: string | null; status?: string; starts_at: string; created_at?: string; mode_id: ModeId };
        Update: { id?: string; code?: string; host_id?: string | null; status?: string; starts_at?: string; created_at?: string; mode_id?: ModeId };
        Relationships: [];
      };
      feedback_reports: {
        Row: { id: string; emailed: boolean; emailed_at: string | null };
        Insert: never;
        Update: { emailed?: boolean; emailed_at?: string };
        Relationships: [];
      };
      /** Solo service role (`/api/ops/notify`): avisos del watchdog del server. */
      ops_events: {
        Row: { id: number; created_at: string; kind: string; tournament_id: string | null; detail: Json; notified_at: string | null; mailed: boolean };
        Insert: never;
        Update: { notified_at?: string; mailed?: boolean };
        Relationships: [];
      };
      game_modes: {
        Row: { id: ModeId; name: string; room_size: number; active: boolean; sort: number };
        Insert: never;
        Update: never;
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      get_active_match: { Args: Empty; Returns: ActiveMatch | null };
      get_active_tournament: { Args: Empty; Returns: { tournament_id: string; mode_id: ModeId | "ranked" } | null };
      get_bracket: { Args: { p_tournament: string }; Returns: BracketSnapshot };
      get_match_scene: { Args: { p_match: string }; Returns: MatchScene | null };
      get_match_penals: {
        Args: { p_match: string };
        Returns: { idx: number; kicker_participant_id: string; scored: boolean; reason: string }[];
      };
      get_tournament_history: { Args: Empty; Returns: TournamentHistoryEntry[] };
      get_penalty_result: { Args: { p_penalty: string }; Returns: PenalResultPayload | null };
      select_option: { Args: { p_penalty: string; p_option: number }; Returns: undefined };
      resolve_penalty: { Args: { p_penalty: string }; Returns: undefined };
      open_next_round: { Args: { p_tournament: string }; Returns: undefined };
      abandon: { Args: { p_match: string }; Returns: undefined };
      begin_presentation: { Args: { p_tournament: string }; Returns: undefined };
      quick_play: { Args: { p_mode?: ModeId }; Returns: RoomRef[] };
      create_room: { Args: { p_mode?: ModeId }; Returns: RoomRef[] };
      join_room: { Args: { p_code: string }; Returns: RoomRef[] };
      leave_room: { Args: { p_code: string }; Returns: undefined };
      username_available: { Args: { check_name: string }; Returns: boolean };
      ranked_enqueue: { Args: Empty; Returns: RankedPoll };
      ranked_poll: { Args: Empty; Returns: RankedPoll };
      ranked_cancel: { Args: Empty; Returns: undefined };
      get_ranked_me: { Args: Empty; Returns: RankedMe };
      get_ranked_match: { Args: { p_tournament: string }; Returns: RankedMatchView };
      get_ranking: { Args: { p_limit?: number }; Returns: Ranking };
      get_profile_stats: { Args: Empty; Returns: ProfileStats };
      set_favorites: { Args: { p_club: string; p_nation: string }; Returns: { club: string; nation: string } };
      get_fan_ranking: { Args: Empty; Returns: FanRanking };
      lobby_favorite: { Args: { p_mode: string }; Returns: LobbyFavorite | null };
      /** Telemetría propia (feedback 4 F): la manda `lib/telemetry/client.ts`, con rate limit server. */
      log_client_event: { Args: { p_kind: string; p_route: string | null; p_detail: Json }; Returns: undefined };
      /** Solo service role (`POST /api/feedback`). */
      submit_feedback: {
        Args: {
          p_user: string | null;
          p_username: string | null;
          p_kind: "bug" | "idea";
          p_message: string;
          p_route: string | null;
          p_meta: Json;
          p_ip_hash: string;
        };
        Returns: string;
      };
      /** Solo service role (`POST /api/feedback`, `kind: "auto"`): una fila por fingerprint, mail ≤ 1 cada 24 h. */
      submit_auto_report: {
        Args: {
          p_fingerprint: string;
          p_user: string | null;
          p_message: string;
          p_route: string | null;
          p_meta: Json;
          p_ip_hash: string;
        };
        Returns: { id: string; notify: boolean; occurrences: number }[];
      };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};
