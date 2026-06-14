# Supabase

Acá viven las migraciones, políticas RLS, funciones RPC y Edge Functions.

- `migrations/` — esquema + RLS (se agregan desde F3). 
- `functions/` — Edge Functions autoritativas (F4+).

El estado del juego es autoritativo del servidor; el cliente nunca decide resultados ni
conoce `correct_index`. Ver SPEC §2 y §5.

## Config de Auth (necesaria para login por username)

El login es username+contraseña con email sintético `<username>@users.tanda2026.com.ar`.
Para que funcione, la config de Auth del proyecto debe quedar:

- **Email provider habilitado** (`external_email_enabled = true`).
- **Confirm email OFF** → `mailer_autoconfirm = true` (alta inmediata, sin mandar mail).
- **Secure email change OFF** → `mailer_secure_email_change_enabled = false` (permite
  cargar el email real opcional después, confirmando solo desde la dirección nueva).
- **Allow new users to sign up** → `disable_signup = false`.

Se puede setear por panel (Authentication → Sign In / Providers → Email) o por
Management API (`PATCH /v1/projects/{ref}/config/auth`).

