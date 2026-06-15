"use server";

import { createClient } from "@/lib/supabase/server";
import { isValidAvatar } from "@/lib/avatar/parts";

export interface SaveAvatarResult {
  ok: boolean;
  error?: string;
}

/**
 * Persiste el avatar del usuario logueado en `profiles.avatar`. Nunca confía en el
 * cliente: revalida la forma con {@link isValidAvatar} y escribe solo la fila propia
 * (la RLS `profiles_update_own` cubre la pertenencia). Ver SPEC §8.2.
 */
export async function saveAvatar(avatar: unknown): Promise<SaveAvatarResult> {
  if (!isValidAvatar(avatar)) {
    return { ok: false, error: "El avatar no es válido." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sesión expirada. Volvé a entrar." };

  const { error } = await supabase
    .from("profiles")
    .update({ avatar })
    .eq("id", user.id);

  if (error) return { ok: false, error: "No se pudo guardar. Probá de nuevo." };
  return { ok: true };
}
