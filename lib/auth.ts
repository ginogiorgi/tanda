/**
 * Login por username: Supabase necesita email, así que usamos un email sintético
 * determinista `<username>@tanda.invalid` (no es un email real). El email real para
 * recuperación es opcional y se carga después en Perfil. Ver SPEC §2 / §5.1-bis.
 */

/**
 * Dominio sintético para el login por username. Subdominio de nuestro dominio real
 * (pasa la validación de GoTrue, que rechaza TLDs reservados como .invalid). No tiene
 * buzón: nunca se envía mail a estas direcciones (la confirmación está deshabilitada).
 */
export const SYNTHETIC_EMAIL_DOMAIN = "users.tanda2026.com.ar";

/** Username: 3–20 caracteres, alfanumérico + guion bajo. */
export const USERNAME_REGEX = /^[a-zA-Z0-9_]{3,20}$/;

/** Email sintético determinista a partir del username (case-insensitive). */
export function usernameToEmail(username: string): string {
  return `${username.trim().toLowerCase()}@${SYNTHETIC_EMAIL_DOMAIN}`;
}

export function isValidUsername(username: string): boolean {
  return USERNAME_REGEX.test(username.trim());
}
