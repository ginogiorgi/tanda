# Supabase

Acá viven las migraciones, políticas RLS y funciones RPC.

- `migrations/` — esquema + RLS + RPCs autoritativas (PLPGSQL). Fuente de verdad.
- `tests/` — suite del camino autoritativo SQL/RPC (Vitest project `db`, ver abajo).

El camino autoritativo corre **en Postgres (PLPGSQL)**, no en Edge Functions (decisión por
escalabilidad/anti-trampa, SPEC §1.2/§1.3 — v1 no tiene Edge Functions). El estado del juego es
autoritativo del servidor; el cliente nunca decide resultados ni conoce `correct_index`. Ver SPEC §2 y §5.

## Desarrollo local + tests del camino autoritativo (9.0)

Los ports PLPGSQL se testean contra un Postgres local de Supabase (Docker), comparándolos en vivo
contra el motor TS (`lib/engine`). Requiere Docker.

```
pnpm db:start    # levanta solo el contenedor de Postgres (supabase start -x <servicios>)
pnpm db:reset    # aplica TODA la cadena de migraciones desde archivos (== remoto)
pnpm test:db     # corre supabase/tests/** (paridad, anti-trampa, e2e torneo, reloj de ronda, abandon)
pnpm db:stop
```

`pnpm test` sigue siendo unit-only (motor TS, sin Docker). En CI el job `db` hace start → reset →
test:db, así una migración rota se atrapa antes del merge. Los `.sql` del repo son autocontenidos:
`db reset` los aplica de cero (baseline v2 + wiring + seed del catálogo).

El catálogo (preguntas y equipos) vive en `data/` y se valida/genera con `pnpm catalog:check` /
`pnpm catalog:build <timestamp_nombre>` (nunca editar el SQL de seed a mano).

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

## Recuperación de contraseña (F2 2.6)

El email de login es sintético (sin buzón). El email real de recuperación se guarda en
`user_metadata.recovery_email` y el reset se envía con **nuestro** emisor (Resend), no con
el de Supabase. El flujo: `requestPasswordReset(username)` → `auth.admin.generateLink` →
link a `/auth/confirm` (`verifyOtp`) → `/auth/reset`. Ver SPEC §2.3.

**Pendiente de ops para que entregue de verdad** (el código ya está):

1. **`SUPABASE_SECRET_KEY`** en `.env.local` y en Vercel (hoy está vacío). Sin esto el
   admin API (`generateLink`) no corre y la recuperación no funciona.
2. **Resend**: crear cuenta, **verificar el dominio `tanda2026.com.ar`** (records DNS SPF/
   DKIM), generar API key → `RESEND_API_KEY` en `.env.local` y Vercel. El remitente es
   `no-reply@tanda2026.com.ar` (`lib/email/resend.ts`).
3. **`NEXT_PUBLIC_SITE_URL`** en prod (p. ej. `https://tanda2026.com.ar`) para que el link
   del mail sea absoluto. En dev cae a `http://localhost:3000`.

No hace falta tocar el allowlist de Redirect URLs: el link apunta a nuestro `/auth/confirm`
(usa `verifyOtp` con `token_hash`), no al verify de Supabase.

