"use server";

import { getSession } from "@/lib/supabase/session";
import { isAvatarV2 } from "@/lib/avatar/schema";

export interface SaveAvatarResult {
  ok: boolean;
  error?: string;
}

/**
 * Persiste el avatar del usuario logueado en `profiles.avatar`. Nunca confía en el
 * cliente: revalida ESTRICTO con {@link isAvatarV2} (v2, colores de paleta, peinado del cuerpo) y escribe solo la fila propia
 * (la RLS `profiles_update_own` cubre la pertenencia). Ver SPEC §8.2.
 */
export async function saveAvatar(avatar: unknown): Promise<SaveAvatarResult> {
  if (!isAvatarV2(avatar)) {
    return { ok: false, error: "El avatar no es válido." };
  }

  const { supabase, user } = await getSession();
  if (!user) return { ok: false, error: "Sesión expirada. Volvé a entrar." };

  const { error } = await supabase
    .from("profiles")
    .update({ avatar })
    .eq("id", user.id);

  if (error) return { ok: false, error: "No se pudo guardar. Probá de nuevo." };
  return { ok: true };
}
