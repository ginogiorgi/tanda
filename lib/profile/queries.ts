import type { SupabaseClient } from "@supabase/supabase-js";
import type { TournamentHistoryEntry } from "./history";

/**
 * Trae el historial de torneos del jugador (F10/10.10). La lectura va por la RPC SECURITY DEFINER
 * `get_tournament_history` (las tablas participants/matches/tournaments son deny-all → un SELECT
 * directo daría 0 filas). La RPC usa `auth.uid()` internamente y devuelve el shape exacto de
 * {@link TournamentHistoryEntry}; la agregación (`aggregateStats`) y la UI no cambian.
 */
export async function getTournamentHistory(
  supabase: SupabaseClient,
  _userId: string,
): Promise<TournamentHistoryEntry[]> {
  const { data, error } = await supabase.rpc("get_tournament_history");
  if (error || !data) return [];
  return data as TournamentHistoryEntry[];
}
