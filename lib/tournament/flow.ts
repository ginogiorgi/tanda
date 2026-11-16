/**
 * Máquina de estados del fin de partido/torneo (feedback 2, P5). Antes el "qué se ve" salía de `if`s
 * encadenados en el render de TournamentLive + timers sueltos, sin tests: la derrota llegaba tarde, los
 * cruces duraban 4 s fijos y no se podía volver a mirar el torneo. Esto es puro y determinista: recibe
 * los HECHOS (datos del server + relojes ya vencidos) y devuelve la vista. TournamentLive solo la pinta.
 *
 *   REVEAL → BRACKET ⇄ PENAL → (fin de partido) → BRACKET (gané) | CRUCES (perdí) | CAMPEÓN (gané la final)
 *   CRUCES → RESUMEN · CAMPEÓN → RESUMEN · RESUMEN ⇄ ESPECTADOR ("Ver cómo sigue" / "Ver mi resultado")
 *   ESPECTADOR → RESUMEN cuando termina el torneo.
 */
import type { MatchPhase } from "@/lib/realtime/score";

export type TournamentView =
  | "loading"
  | "error"
  | "penal"
  | "reveal"
  | "bracket"
  | "crossings"
  | "champion"
  | "summary"
  | "spectator";

/** Cuánto se ven los cruces tras quedar afuera (mínimo) y la pantalla de campeón. */
export const CROSSINGS_MIN_MS = 4000;
export const CHAMPION_MS = 4000;
/** Revelación de nación al entrar (B2.3). */
export const REVEAL_MS = 2000;

export interface FlowFacts {
  hasSnapshot: boolean;
  loadError: boolean;
  /** Mi partido está vivo (penal abierto o hueco entre penales del mismo partido, + linger). */
  penalActive: boolean;
  revealExpired: boolean;
  me: { hasTeam: boolean; eliminatedPhase: MatchPhase | null; placement: number | null } | null;
  tournamentFinished: boolean;
  /** Ya existen los partidos de la ronda siguiente a la mía (o no hay ronda siguiente). */
  nextRoundReady: boolean;
  /** Pasaron ≥ CROSSINGS_MIN_MS desde que quedé afuera. */
  crossingsElapsed: boolean;
  /** Pasaron ≥ CHAMPION_MS desde que salí campeón. */
  championElapsed: boolean;
  /** Elegí "Ver cómo sigue" desde el resumen. */
  spectating: boolean;
}

export function isOut(me: FlowFacts["me"]): boolean {
  return me != null && (me.eliminatedPhase != null || me.placement != null);
}

export function tournamentView(f: FlowFacts): TournamentView {
  if (f.penalActive) return "penal";
  if (!f.hasSnapshot) return f.loadError ? "error" : "loading";

  if (!isOut(f.me)) {
    // Revelación solo al entrar con el torneo arrancando (un refresh tardío va directo al bracket).
    return !f.revealExpired && f.me?.hasTeam ? "reveal" : "bracket";
  }

  if (f.me?.placement === 1) return f.championElapsed ? "summary" : "champion";
  if (f.spectating) return f.tournamentFinished ? "summary" : "spectator";
  // Afuera (KO, grupos, final o 3er puesto): ver cómo quedaron los cruces con la ronda nueva armada.
  return f.crossingsElapsed && f.nextRoundReady ? "summary" : "crossings";
}

const ORDER: MatchPhase[] = ["group", "round_of_32", "round_of_16", "quarters", "semis", "third_place", "final"];

/**
 * ¿Ya está armada la ronda que sigue a la mía? (para que los cruces muestren el cuadro actualizado).
 * Final / 3er puesto o torneo terminado: no hay ronda siguiente → listo.
 */
export function nextRoundReady(
  eliminatedPhase: MatchPhase | null,
  phasesWithMatches: readonly MatchPhase[],
  tournamentFinished: boolean,
): boolean {
  if (tournamentFinished || eliminatedPhase == null) return true;
  if (eliminatedPhase === "final" || eliminatedPhase === "third_place" || eliminatedPhase === "semis") return true;
  const mine = ORDER.indexOf(eliminatedPhase);
  return phasesWithMatches.some((p) => p !== "third_place" && ORDER.indexOf(p) > mine);
}
