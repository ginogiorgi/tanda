/**
 * Acceso tipado a variables de entorno. Ver `.env.example`.
 * Las `NEXT_PUBLIC_*` son seguras para el cliente; el resto es solo server.
 *
 * Supabase usa el formato nuevo de claves: `sb_publishable_...` (cliente) y
 * `sb_secret_...` (solo servidor) reemplazan a las viejas anon/service_role.
 */

/** Config pública de Supabase (segura para el cliente). */
export function publicSupabaseEnv(): { url: string; publishableKey: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !publishableKey) {
    throw new Error(
      "Faltan NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY. Copiá .env.example a .env.local.",
    );
  }
  return { url, publishableKey };
}

/** Secret key — SOLO en servidor/Edge/CI. Nunca exponer al cliente. */
export function secretKey(): string {
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!key) {
    throw new Error("Falta SUPABASE_SECRET_KEY (solo servidor).");
  }
  return key;
}
