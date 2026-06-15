/**
 * Historial y estadísticas del jugador. La **agregación es pura y testeable** (sin red): se
 * alimenta de una lista de participaciones en torneos. Hoy la fuente devuelve lista vacía
 * (las tablas `participants`/`matches`/`penalties` se crean en F3/F6); cuando existan, se
 * mapean sus filas a {@link TournamentHistoryEntry} y se pasan a {@link aggregateStats} sin
 * tocar la UI. Ver SPEC §8 (Perfil → Historial / estadísticas) y PLAN F2.
 */

/** Una participación del jugador en un torneo (una fila del historial). */
export interface TournamentHistoryEntry {
  tournamentId: string;
  /** Selección que le tocó. */
  nationName: string;
  /** Posición final: 1 = campeón, 2 = subcampeón, 3 = tercero… `null` si sigue en curso. */
  placement: number | null;
  /** Fase en la que quedó eliminado (`group`, `round_of_32`…), `null` si fue campeón. */
  eliminatedPhase: string | null;
  /** Goles convertidos por el jugador en el torneo. */
  goalsFor: number;
  matchesPlayed: number;
  matchesWon: number;
  /** ISO timestamp de cuándo jugó (para ordenar el historial). */
  playedAt: string;
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
    if (e.placement === 1) titles += 1;
    goals += e.goalsFor;
    matchesPlayed += e.matchesPlayed;
    matchesWon += e.matchesWon;
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
