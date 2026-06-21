"use client";

import { useState } from "react";
import { HistoryEntryCard } from "./HistoryEntryCard";
import { Button } from "@/components/ui/Button";
import type { TournamentHistoryEntry } from "@/lib/profile/history";

const PAGE_SIZE = 5;

/**
 * Historial completo paginado de a 5 (T13). El historial propio de un usuario es chico, así que la
 * RPC trae todo de una y la paginación es 100% en cliente (slice por página) — las stats agregadas se
 * siguen calculando sobre el total en el perfil. Si algún día creciera mucho, se extiende la RPC con
 * limit/offset (no hace falta hoy).
 */
export function HistoryPager({ entries }: { entries: TournamentHistoryEntry[] }) {
  const [page, setPage] = useState(0);
  const pages = Math.max(1, Math.ceil(entries.length / PAGE_SIZE));
  const current = Math.min(page, pages - 1);
  const slice = entries.slice(current * PAGE_SIZE, current * PAGE_SIZE + PAGE_SIZE);

  return (
    <div className="flex flex-col gap-4">
      <ul className="flex flex-col gap-3">
        {slice.map((entry) => (
          <li key={entry.tournamentId}>
            <HistoryEntryCard entry={entry} />
          </li>
        ))}
      </ul>
      {pages > 1 && (
        <div className="flex items-center justify-between gap-3">
          <Button
            variant="outline"
            size="sm"
            disabled={current === 0}
            onClick={() => setPage(current - 1)}
          >
            ← Anteriores
          </Button>
          <span className="text-xs text-fg-muted">
            Página {current + 1} de {pages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={current >= pages - 1}
            onClick={() => setPage(current + 1)}
          >
            Siguientes →
          </Button>
        </div>
      )}
    </div>
  );
}
