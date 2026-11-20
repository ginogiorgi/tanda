/**
 * Helpers puros del lobby (sin red, testeables). El componente cliente arma el canal de
 * Realtime y le pasa a estas funciones el estado crudo; acá vive el formato del countdown y
 * el aplanado/dedup del estado de Presence.
 */

/** Favorito del modo de la sala (feedback 3 #15): escudo o bandera a la derecha del nombre. */
export type LobbyFav = { name: string; flag: string | null; crest: string | null };

/** Un humano presente en el lobby (derivado del estado de Presence). */
export type LobbyMember = {
  userId: string;
  username: string;
  fav?: LobbyFav;
};

/** Lo que cada cliente trackea en el canal `room:{code}`. */
export type LobbyPresence = {
  userId: string;
  username: string;
  online_at: number;
  fav?: LobbyFav | null;
};

/** Solo un favorito bien formado (lo manda otro cliente: no confiar en la forma). */
function cleanFav(f: LobbyPresence["fav"]): { fav: LobbyFav } | Record<string, never> {
  if (!f || typeof f.name !== "string") return {};
  const str = (v: unknown) => (typeof v === "string" && /^[\w/-]{1,40}$/.test(v) ? v : null);
  return { fav: { name: f.name.slice(0, 40), flag: str(f.flag), crest: str(f.crest) } };
}

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
    .map(({ userId, username, fav }) => ({ userId, username, ...cleanFav(fav) }));
}

/** Entrada del roster acumulado: el miembro + cuándo llegó (orden) y cuándo se lo vio por última vez. */
export type RosterEntry = {
  userId: string;
  username: string;
  online_at: number;
  lastSeen: number;
  fav?: LobbyFav;
};

/** Período de gracia: un jugador ausente del estado de Presence no se quita hasta superarlo. */
export const PRESENCE_GRACE_MS = 4000;

/**
 * Reconcilia un roster ACUMULADO contra el estado de Presence actual, con período de gracia. Esto
 * evita el parpadeo (8.2): una desconexión/re-track transitoria saca a un jugador del `presenceState`
 * por un instante; sin gracia, la fila desaparece y reaparece. Acá los presentes se refrescan y los
 * ausentes recién se descartan tras `graceMs`. Pura → testeable; el reloj entra por `now`.
 */
export function reconcileRoster(
  roster: Map<string, RosterEntry>,
  state: Record<string, LobbyPresence[]>,
  now: number,
  graceMs: number = PRESENCE_GRACE_MS,
): Map<string, RosterEntry> {
  const next = new Map(roster);
  const present = new Set<string>();
  for (const presences of Object.values(state)) {
    for (const p of presences) {
      present.add(p.userId);
      const existing = next.get(p.userId);
      next.set(p.userId, {
        userId: p.userId,
        username: p.username,
        ...cleanFav(p.fav),
        // conservar el online_at más viejo → orden de llegada estable aunque re-trackee.
        online_at: existing ? Math.min(existing.online_at, p.online_at) : p.online_at,
        lastSeen: now,
      });
    }
  }
  for (const [id, entry] of next) {
    if (!present.has(id) && now - entry.lastSeen > graceMs) next.delete(id);
  }
  return next;
}

/** Lista de miembros del roster, ordenada por llegada (estable). */
export function rosterMembers(roster: Map<string, RosterEntry>): LobbyMember[] {
  return [...roster.values()]
    .sort((a, b) => a.online_at - b.online_at)
    .map(({ userId, username, fav }) => ({ userId, username, ...(fav ? { fav } : {}) }));
}
