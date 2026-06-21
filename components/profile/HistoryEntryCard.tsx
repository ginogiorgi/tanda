import { ResultCard } from "@/components/penal/ResultCard";
import type { TournamentHistoryEntry } from "@/lib/profile/history";

/** Fase legible para el caption de la tarjeta del historial. */
const PHASE_ES: Record<string, string> = {
  group: "Fase de grupos",
  round_of_32: "32avos",
  round_of_16: "Octavos",
  quarters: "Cuartos",
  semis: "Semifinal",
  third_place: "3er puesto",
  final: "Final",
};

/**
 * Tarjeta de una fila del historial (tipo resultado): selección del jugador vs. el rival del partido
 * más avanzado, con el desenlace. Presentacional y compartida por el perfil (últimos 5) y la pantalla
 * de historial completo paginado (T13), para no duplicar el mapeo de fases ni el shape de props.
 */
export function HistoryEntryCard({ entry }: { entry: TournamentHistoryEntry }) {
  return (
    <ResultCard
      caption={entry.finalPhase ? PHASE_ES[entry.finalPhase] : undefined}
      left={{ code: entry.nationCode, kit: entry.kitPrimary, isMe: true }}
      right={{ code: entry.finalOppNationCode, kit: entry.finalOppKitPrimary }}
      leftScore={entry.finalMyScore}
      rightScore={entry.finalOppScore}
      outcome={entry.outcome}
    />
  );
}
