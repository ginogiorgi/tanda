import type { SupabaseClient } from "@supabase/supabase-js";
import type { TournamentHistoryEntry } from "./history";

/**
 * Trae el historial de torneos del jugador. **Stub hasta F3/F6**: las tablas
 * `participants`/`matches`/`tournaments` todavía no existen, así que devuelve lista vacía.
 * Cuando existan, esta función mapea sus filas (placement, eliminated_phase, goles, etc.) a
 * {@link TournamentHistoryEntry}; la agregación y la UI no cambian. Ver SPEC §8 / PLAN F6.
 */
export async function getTournamentHistory(
  _supabase: SupabaseClient,
  _userId: string,
): Promise<TournamentHistoryEntry[]> {
  return [];
}
