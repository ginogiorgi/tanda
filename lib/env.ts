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

/** Secret key — SOLO en servidor/CI. Nunca exponer al cliente. */
export function secretKey(): string {
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!key) {
    throw new Error("Falta SUPABASE_SECRET_KEY (solo servidor).");
  }
  return key;
}

/**
 * URL pública del sitio, para armar links absolutos en mails (recuperación). En prod se
 * setea `NEXT_PUBLIC_SITE_URL`; en dev cae a localhost.
 */
export function siteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
}

/** API key de Resend (envío de mails). Solo servidor. `null` si todavía no se configuró. */
export function resendApiKey(): string | null {
  return process.env.RESEND_API_KEY ?? null;
}
