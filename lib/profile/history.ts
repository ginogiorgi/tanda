/**
 * Historial y estadísticas del jugador. La **agregación es pura y testeable** (sin red): se
 * alimenta de una lista de participaciones en torneos que devuelve la RPC `get_tournament_history`
 * (ver `lib/profile/queries.ts`), mapeadas a {@link TournamentHistoryEntry} y pasadas a
 * {@link aggregateStats}. Ver SPEC §8 (Perfil → Historial / estadísticas).
 */
import type { MatchPhase } from "@/lib/realtime/score";

/** Desenlace del jugador en el torneo, para la tarjeta del historial (tarea 7). */
export type HistoryOutcome = "won" | "lost" | "abandoned" | null;

/** Una participación del jugador en un torneo (una fila del historial). */
export interface TournamentHistoryEntry {
  tournamentId: string;
  /** Modo del torneo (`worldcup` | `arg`). */
  modeId: string;
  /** Equipo que le tocó. */
  teamName: string;
  /** Código de la selección del jugador (p. ej. "ARG") + color de kit, para la tarjeta. */
  teamCode: string | null;
  teamFlag: string | null;
  teamCrest: string | null;
  kitPrimary: string | null;
  /** Posición final: 1 = campeón, 2 = subcampeón, 3 = tercero… `null` si sigue en curso. */
  placement: number | null;
  /** Fase en la que quedó eliminado (`group`, `round_of_32`…), `null` si fue campeón. */
  eliminatedPhase: string | null;
  /** Goles convertidos por el jugador en el torneo. */
  goalsFor: number;
  matchesPlayed: number;
  matchesWon: number;
  /** El jugador tocó Abandonar: el desenlace de la fila no es suyo (lo siguió un bot). */
  abandoned: boolean;
  /** ISO timestamp de cuándo jugó (para ordenar el historial). */
  playedAt: string;
  // ── Partido más avanzado y terminado (para la tarjeta tipo resultado, tarea 7) ──
  finalPhase: MatchPhase | null;
  finalMyScore: number | null;
  finalOppScore: number | null;
  finalOppTeamCode: string | null;
  finalOppFlag: string | null;
  finalOppCrest: string | null;
  finalOppKitPrimary: string | null;
  /** Ganaste / perdiste ese partido, o abandonaste el torneo. */
  outcome: HistoryOutcome;
}

/** Estadísticas agregadas que se muestran en el Perfil. */
export interface AggregateStats {
  /** Torneos ganados (placement === 1). */
  titles: number;
  /** % de partidos ganados, 0..1 (0 si no jugó ninguno). */
  winRate: number;
  /** Goles totales convertidos. */
  goals: number;
  /** Mejor posición lograda (mínimo placement), `null` si nunca terminó un torneo. */
  bestPlacement: number | null;
  /** Torneos jugados. */
  tournamentsPlayed: number;
}

/** Agrega una lista de participaciones a las stats del Perfil. Pura y determinista. */
export function aggregateStats(
  entries: readonly TournamentHistoryEntry[],
): AggregateStats {
  let titles = 0;
  let goals = 0;
  let matchesPlayed = 0;
  let matchesWon = 0;
  let bestPlacement: number | null = null;

  for (const e of entries) {
    goals += e.goalsFor;
    matchesPlayed += e.matchesPlayed;
    matchesWon += e.matchesWon;
    // Un torneo abandonado no cuenta como título ni mejor posición: el desenlace lo logró el bot
    // que te reemplazó, no vos.
    if (e.abandoned) continue;
    if (e.placement === 1) titles += 1;
    if (e.placement !== null) {
      bestPlacement =
        bestPlacement === null ? e.placement : Math.min(bestPlacement, e.placement);
    }
  }

  return {
    titles,
    winRate: matchesPlayed === 0 ? 0 : matchesWon / matchesPlayed,
    goals,
    bestPlacement,
    tournamentsPlayed: entries.length,
  };
}

/** Stats en cero (sin participaciones). Útil como default y para el estado vacío. */
export const EMPTY_STATS: AggregateStats = aggregateStats([]);
