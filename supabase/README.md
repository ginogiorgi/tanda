# Supabase

Acá viven las migraciones, políticas RLS, funciones RPC y Edge Functions.

- `migrations/` — esquema + RLS (se agregan desde F3). 
- `functions/` — Edge Functions autoritativas (F4+).

El estado del juego es autoritativo del servidor; el cliente nunca decide resultados ni
conoce `correct_index`. Ver SPEC §2 y §5.
