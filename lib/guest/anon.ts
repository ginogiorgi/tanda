// Modo invitado (§8.4, redefinido jun 2026): el invitado es un usuario REAL pero efímero —
// sesión anónima de Supabase, sin password/recuperación, sin progreso guardado. Juega el camino
// competitivo real como cualquiera. Se le autoasigna un username `invitado_<random>` (válido y
// único de hecho) y el avatar default; el trigger handle_new_user le arma el profile liviano.
import type { SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_AVATAR } from "@/lib/avatar/schema";

/** `invitado_` + 9 dígitos → 18 chars, matchea USERNAME_REGEX. Colisión despreciable (1e9). */
export function generateGuestUsername(): string {
  const digits = Math.floor(Math.random() * 1_000_000_000)
    .toString()
    .padStart(9, "0");
  return `invitado_${digits}`;
}

/**
 * Crea una sesión anónima con username autoasignado + avatar default. Reintenta ante el caso
 * (rarísimo) de colisión de username, que el trigger rebota como error al guardar el usuario.
 */
export async function signInAsGuest(
  supabase: SupabaseClient,
  attempts = 3,
): Promise<{ error: string | null }> {
  for (let i = 0; i < attempts; i++) {
    const username = generateGuestUsername();
    const { error } = await supabase.auth.signInAnonymously({
      options: { data: { username, avatar: DEFAULT_AVATAR } },
    });
    if (!error) return { error: null };
    // Último intento: devolvemos el error; si no, reintentamos con otro username.
    if (i === attempts - 1) {
      return {
        error: /anonymous|disabled|provider/i.test(error.message)
          ? "El modo invitado no está disponible ahora."
          : "No se pudo entrar como invitado. Probá de nuevo.",
      };
    }
  }
  return { error: "No se pudo entrar como invitado. Probá de nuevo." };
}
