/**
 * Cola ranked "N esperando" (feedback 3 #13). Cada jugador en la pantalla de cola trackea su presencia
 * en el canal de Realtime `ranked:queue` con `key = user.id` → estar en la pantalla = estar encolado.
 * Exacto, en tiempo real y sin consultas a la DB. Puro (sin red) → testeable.
 */

/** Canal de Presence de la cola ranked (uno para todos). */
export const RANKED_QUEUE_CHANNEL = "ranked:queue";

/** Cuántos OTROS jugadores hay en la cola: keys distintas de la mía con al menos una presencia. */
export function othersWaiting(state: Record<string, readonly unknown[]>, me: string): number {
  let n = 0;
  for (const [key, presences] of Object.entries(state)) {
    if (key && key !== me && presences.length > 0) n++;
  }
  return n;
}

/** "0 esperando", "1 esperando", "2 esperando"… */
export function waitingLabel(n: number): string {
  return `${Math.max(0, Math.floor(n))} esperando`;
}
