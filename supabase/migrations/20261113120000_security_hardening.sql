-- Auditoría 2026-11 (advisor 0028): los helpers de RLS/Realtime solo los evalúan policies `TO authenticated`;
-- `anon` (sin sesión) no tiene por qué poder llamarlos por /rest/v1/rpc. `username_available` queda
-- abierto a anon a propósito (lo usa el registro antes de tener sesión).
REVOKE ALL ON FUNCTION public.is_match_member(uuid)          FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_room_member(uuid)           FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_tournament_member(uuid)     FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.realtime_match_member(text)     FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.realtime_tournament_member(text) FROM PUBLIC, anon;

-- Policies de profiles sin rol explícito → aplicaban también a anon (inofensivo, auth.uid() es null),
-- pero se acotan a authenticated para que el modelo sea explícito.
ALTER POLICY "profiles_select_own" ON public.profiles TO authenticated;
ALTER POLICY "profiles_update_own" ON public.profiles TO authenticated;
