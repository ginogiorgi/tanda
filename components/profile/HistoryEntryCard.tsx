import { ResultCard } from "@/components/penal/ResultCard";
import type { TournamentHistoryEntry } from "@/lib/profile/history";
import { getMode, phaseLabel } from "@/lib/modes";


/**
 * Tarjeta de una fila del historial (tipo resultado): selección del jugador vs. el rival del partido
 * más avanzado, con el desenlace. Presentacional y compartida por el perfil (últimos 5) y la pantalla
 * de historial completo paginado (T13), para no duplicar el mapeo de fases ni el shape de props.
 */
function caption(entry: TournamentHistoryEntry): string {
  const mode = getMode(entry.modeId);
  const phase = entry.finalPhase;
  return phase ? `${mode.name} · ${phaseLabel(mode, phase)}` : mode.name;
}

export function HistoryEntryCard({ entry }: { entry: TournamentHistoryEntry }) {
  return (
    <ResultCard
      caption={caption(entry)}
      left={{ code: entry.teamCode, kit: entry.kitPrimary, flag: entry.teamFlag, crest: entry.teamCrest, isMe: true }}
      right={{
        code: entry.finalOppTeamCode,
        kit: entry.finalOppKitPrimary,
        flag: entry.finalOppFlag,
        crest: entry.finalOppCrest,
      }}
      leftScore={entry.finalMyScore}
      rightScore={entry.finalOppScore}
      outcome={entry.outcome}
    />
  );
}
