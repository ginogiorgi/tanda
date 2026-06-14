/**
 * Acceso tipado a variables de entorno. Ver `.env.example`.
 * Las `NEXT_PUBLIC_*` son seguras para el cliente; el resto es solo server.
 */

/** Config pública de Supabase (segura para el cliente). */
export function publicSupabaseEnv(): { url: string; anonKey: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error(
      "Faltan NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY. Copiá .env.example a .env.local.",
    );
  }
  return { url, anonKey };
}

/** Service role key — SOLO en servidor/Edge/CI. Nunca exponer al cliente. */
export function serviceRoleKey(): string {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error("Falta SUPABASE_SERVICE_ROLE_KEY (solo servidor).");
  }
  return key;
}
