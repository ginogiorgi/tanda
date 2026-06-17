/**
 * Preferencias del jugador persistidas en localStorage (SPEC §8.1, 8.12): por ahora el mute del
 * audio. `prefers-reduced-motion` se respeta por CSS (globals.css), no acá. Funciones puras y
 * defensivas (SSR / sin localStorage → defaults).
 */

export interface Prefs {
  muted: boolean;
}

const KEY = "tanda:prefs";
const DEFAULTS: Prefs = { muted: false };

export function loadPrefs(): Prefs {
  if (typeof window === "undefined") return DEFAULTS;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<Prefs>;
    return { muted: parsed.muted === true };
  } catch {
    return DEFAULTS;
  }
}

export function savePrefs(prefs: Prefs): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    // localStorage no disponible (modo privado / bloqueado): seguimos sin persistir.
  }
}
