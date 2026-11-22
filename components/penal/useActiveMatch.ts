import { useCallback, useEffect, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { LATE_RESULT_GRACE_MS, lingerWaitMs, TIMING } from "@/lib/engine/timing";
import { samePhase, type ActiveMatch, type PenalStartPayload } from "@/lib/realtime/penal";
import { fire } from "@/lib/supabase/fire";
import type { Database } from "@/lib/supabase/database.types";

/**
 * Poll de 1 s de `get_active_match` compartido por `TournamentLive` y `RankedLive` (Plan 5 Z: era el mismo
 * código en los dos). Decide si se ve la escena de penal:
 *  • `am != null` → MI partido está vivo (penal abierto o hueco corto entre penales): escena de penal, y el
 *    penal que ve el poll va a `serverPenal` (`PenalLive` lo adopta si se perdió el broadcast, feedback 4 F).
 *  • `am == null` → terminó mi partido: el último cartel se ve completo (linger desde que LLEGÓ su resultado,
 *    feedback 3 #12) y después se suelta la escena.
 *
 * Poke de respaldo a `open_next_round`: el preciso lo hace `round:next` (torneos) y `tick()` corre cada 1 s,
 * así que el cliente solo pokea si ya pasó casi todo el hueco entre penales sin penal a la vista (antes pokeaba
 * CADA segundo de cada hueco: ~1 RPC/s por jugador que casi siempre era no-op).
 */
export const BACKSTOP_POKE_AFTER_MS = (TIMING.betweenPenalsS - 1) * 1000;

export function useActiveMatch(supabase: SupabaseClient<Database>, tournamentId: string) {
  const [matchId, setMatchId] = useState<string | null>(null);
  const [serverPenal, setServerPenal] = useState<PenalStartPayload | null>(null);
  const [showPenal, setShowPenal] = useState(false);
  // ¿Ya jugué al menos un penal? Distingue la espera entre rondas de la presentación inicial (B5.2).
  const [everPlayed, setEverPlayed] = useState(false);
  const showPenalRef = useRef(false);
  const lingerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastResultAtRef = useRef(0);
  const lastPenalSeenRef = useRef(0);
  const pollRef = useRef<(() => void) | null>(null);

  const onResult = useCallback((at: number) => {
    lastResultAtRef.current = Math.max(lastResultAtRef.current, at);
  }, []);

  useEffect(() => {
    let active = true;
    lastPenalSeenRef.current = Date.now();
    const poll = async () => {
      const { data } = await supabase.rpc("get_active_match");
      if (!active) return;
      const am = data as ActiveMatch | null;
      if (am?.penal) lastPenalSeenRef.current = Date.now();
      else if (Date.now() - lastPenalSeenRef.current >= BACKSTOP_POKE_AFTER_MS) {
        fire(supabase.rpc("open_next_round", { p_tournament: tournamentId }), "open_next_round");
      }
      if (am?.match_id) {
        if (lingerRef.current) {
          clearTimeout(lingerRef.current);
          lingerRef.current = null;
        }
        setMatchId(am.match_id);
        setServerPenal((prev) => (samePhase(prev, am.penal) ? prev : am.penal));
        setShowPenal(true);
        setEverPlayed(true);
        showPenalRef.current = true;
      } else if (showPenalRef.current && !lingerRef.current) {
        const release = () => {
          const wait = lingerWaitMs(lastResultAtRef.current, Date.now());
          if (wait > 0) {
            lingerRef.current = setTimeout(release, wait);
            return;
          }
          setShowPenal(false);
          showPenalRef.current = false;
          lingerRef.current = null;
        };
        lingerRef.current = setTimeout(release, LATE_RESULT_GRACE_MS);
      }
    };
    pollRef.current = () => void poll();
    void poll();
    const id = setInterval(() => void poll(), 1000);
    return () => {
      active = false;
      clearInterval(id);
      if (lingerRef.current) clearTimeout(lingerRef.current);
    };
  }, [supabase, tournamentId]);

  /** Fuerza un poll ya (p. ej. justo después del poke preciso de `round:next`). */
  const pollNow = useCallback(() => pollRef.current?.(), []);

  return { matchId, serverPenal, showPenal, everPlayed, onResult, pollNow };
}
