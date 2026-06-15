/**
 * Helpers puros del lobby (sin red, testeables). El componente cliente arma el canal de
 * Realtime y le pasa a estas funciones el estado crudo; acá vive el formato del countdown y
 * el aplanado/dedup del estado de Presence.
 */

/** Un humano presente en el lobby (derivado del estado de Presence). */
export type LobbyMember = {
  userId: string;
  username: string;
};

/** Lo que cada cliente trackea en el canal `room:{code}`. */
export type LobbyPresence = {
  userId: string;
  username: string;
  online_at: number;
};

/**
 * Formatea milisegundos restantes como `m:ss`. Clampa a `0:00` (nunca negativo): el penal
 * y el arranque del torneo los decide el server, el cliente solo dibuja.
 */
export function formatRemaining(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

/**
 * Aplana el estado de Presence (`{ key: presences[] }`) a una lista de miembros únicos por
 * `userId`, ordenada por `online_at` (orden de llegada, estable). Si un mismo usuario tiene
 * varias pestañas/presencias, queda la más vieja.
 */
export function presenceMembers(
  state: Record<string, LobbyPresence[]>,
): LobbyMember[] {
  const byUser = new Map<string, LobbyPresence>();
  for (const presences of Object.values(state)) {
    for (const p of presences) {
      const existing = byUser.get(p.userId);
      if (!existing || p.online_at < existing.online_at) {
        byUser.set(p.userId, p);
      }
    }
  }
  return [...byUser.values()]
    .sort((a, b) => a.online_at - b.online_at)
    .map(({ userId, username }) => ({ userId, username }));
}
