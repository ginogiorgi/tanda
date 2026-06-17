// Modo invitado (§8.4): identidad SOLO del cliente. El nombre vive en localStorage, no hay usuario
// Supabase ni fila en profiles. Las funciones de validación son puras (testeables).

export const GUEST_NAME_KEY = "tanda_guest_name";

const MIN = 2;
const MAX = 20;

/** Normaliza el nombre: recorta espacios y colapsa los internos. */
export function normalizeGuestName(raw: string): string {
  return raw.trim().replace(/\s+/g, " ");
}

/** Válido = 2–20 chars tras normalizar (no único, sin password). */
export function isValidGuestName(raw: string): boolean {
  const n = normalizeGuestName(raw);
  return n.length >= MIN && n.length <= MAX;
}

/** Lee el nombre guardado (o null fuera del browser / si no hay). */
export function getGuestName(): string | null {
  if (typeof window === "undefined") return null;
  const v = window.localStorage.getItem(GUEST_NAME_KEY);
  return v && isValidGuestName(v) ? normalizeGuestName(v) : null;
}

/** Guarda el nombre normalizado. No-op fuera del browser. */
export function setGuestName(raw: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(GUEST_NAME_KEY, normalizeGuestName(raw));
}
