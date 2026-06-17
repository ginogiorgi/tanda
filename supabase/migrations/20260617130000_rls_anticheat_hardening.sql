-- Tanda — F9 / tarea 9.1: hardening de la superficie ejecutable (least-privilege).
--
-- La auditoría RLS + anti-trampa (codificada en supabase/tests/rls_audit.test.ts) detectó dos
-- fugas de superficie por el GRANT default de PUBLIC sobre funciones (Postgres concede EXECUTE a
-- PUBLIC al crear una función salvo que se revoque). Ninguna es explotable, pero la superficie
-- debe quedar mínima:
--
--   (1) abandon(uuid): no tenía grant/revoke explícito → quedaba ejecutable por `anon` vía PUBLIC.
--       Es una RPC de cliente que exige sesión (auth.uid()); debe ser solo `authenticated`.
--   (2) Helpers puros/deterministas del motor sin revoke → ejecutables por `authenticated`/`anon`
--       vía PUBLIC. No son sensibles (la misma lógica viaja al cliente en lib/engine para el modo
--       invitado), pero solo se llaman desde RPCs SECURITY DEFINER (corren como owner) y desde el
--       harness de tests (conecta como owner) → revocarlas de PUBLIC no afecta runtime. Sigue el
--       patrón ya aplicado a engine_fnv32 / engine_group_standings.
--
-- Las helpers usadas en policies RLS (is_*_member, realtime_*_member) NO se tocan: mantienen su
-- grant a `authenticated` porque la policy se evalúa con el rol que consulta.

-- (1) abandon: RPC de cliente, solo authenticated.
revoke all on function public.abandon(uuid) from public, anon;
grant execute on function public.abandon(uuid) to authenticated;

-- (2) Helpers puros del motor (firmas por tipos de argumento de entrada; los OUT no identifican).
revoke all on function public.engine_imul(bigint, bigint) from public, anon, authenticated;
revoke all on function public.engine_mulberry32(bigint) from public, anon, authenticated;
revoke all on function public.engine_rand_int(bigint, int) from public, anon, authenticated;
revoke all on function public.engine_rand_bool(bigint) from public, anon, authenticated;
revoke all on function public.engine_hash32(text) from public, anon, authenticated;
revoke all on function public.engine_bot_intent(public.difficulty_tier, bigint)
  from public, anon, authenticated;
revoke all on function public.engine_advance_match(text, boolean[])
  from public, anon, authenticated;
revoke all on function public.bot_penalty_scored(
  bigint, public.difficulty_tier, public.difficulty_tier, uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.tanda_penalty_difficulty(public.match_phase, int)
  from public, anon, authenticated;

-- (3) RPCs de cliente que quedaron ejecutables por el rol `anon` (sesión sin login) vía el GRANT
-- default de PUBLIC: se hizo `grant ... to authenticated` pero nunca se revocó de PUBLIC. Todas
-- exigen sesión (`auth.uid() is null → unauthenticated`), así que llamarlas como `anon` no logra
-- nada... salvo `resolve_penalty`, donde `auth.uid() null` ES el camino de backstop del cron (saltea
-- el chequeo de pertenencia). No es explotable (solo dispara una resolución que igual ocurriría por
-- `tick()` en ≤10s, idempotente, sin revelar nada), pero el backstop es para `tick()`/cron, no para
-- el rol `anon`. Least-privilege: estas RPC son solo para `authenticated`.
-- NO se tocan los helpers de pertenencia (is_*_member, realtime_*_member): son booleanos que evalúan
-- las policies RLS y deben quedar ejecutables por ambos roles. `username_available` sigue abierto a
-- `anon` (lo usa el form de registro antes del login).
revoke all on function public.create_room() from public, anon;
grant execute on function public.create_room() to authenticated;
revoke all on function public.quick_play() from public, anon;
grant execute on function public.quick_play() to authenticated;
revoke all on function public.join_room(text) from public, anon;
grant execute on function public.join_room(text) to authenticated;
revoke all on function public.leave_room(text) from public, anon;
grant execute on function public.leave_room(text) to authenticated;
revoke all on function public.select_option(uuid, int) from public, anon;
grant execute on function public.select_option(uuid, int) to authenticated;
revoke all on function public.open_penalty(uuid) from public, anon;
grant execute on function public.open_penalty(uuid) to authenticated;
revoke all on function public.open_next_round(uuid) from public, anon;
grant execute on function public.open_next_round(uuid) to authenticated;
revoke all on function public.resolve_penalty(uuid) from public, anon;
grant execute on function public.resolve_penalty(uuid) to authenticated;
revoke all on function public.get_active_match() from public, anon;
grant execute on function public.get_active_match() to authenticated;
revoke all on function public.get_active_tournament() from public, anon;
grant execute on function public.get_active_tournament() to authenticated;
revoke all on function public.get_bracket(uuid) from public, anon;
grant execute on function public.get_bracket(uuid) to authenticated;
revoke all on function public.get_match_penals(uuid) from public, anon;
grant execute on function public.get_match_penals(uuid) to authenticated;
revoke all on function public.get_match_scene(uuid) from public, anon;
grant execute on function public.get_match_scene(uuid) to authenticated;
revoke all on function public.dev_create_practice_penal() from public, anon;
grant execute on function public.dev_create_practice_penal() to authenticated;
