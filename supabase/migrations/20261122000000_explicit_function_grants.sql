-- EXECUTE explícito sobre las funciones de `public` (el par de 20261119000000_explicit_table_grants).
--
-- El baseline es un pg_dump: para funciones solo emite `REVOKE … FROM PUBLIC` (asume el ACL por defecto
-- de Postgres) → al recrearlas, el default ACL de la plataforma les da EXECUTE a anon/authenticated y
-- nada lo revoca. Con la imagen de Postgres de la CLI v2 eso no pasaba en local; con la de la CLI v3
-- (17.11.0.018) TODAS las funciones internas (open_round, tick, enforce_rate_limit…) quedaban
-- ejecutables por el cliente (lo detectó rls_audit/anticheat). En prod la superficie ya era la correcta
-- (revocada a mano migración por migración) → acá queda independiente de defaults, y es no-op en prod.
--
-- Superficie == allowlist de supabase/tests/rls_audit.test.ts (editar ambos juntos). service_role y el
-- owner no se tocan; los triggers no necesitan EXECUTE del que dispara.
do $$
declare
  r record;
  auth_allow text[] := array[
    -- RPCs de cliente
    'abandon', 'begin_presentation', 'create_room', 'get_active_match', 'get_active_tournament',
    'get_bracket', 'get_match_penals', 'get_match_scene', 'get_penalty_result', 'get_profile_stats',
    'get_ranked_match', 'get_ranked_me', 'get_ranking', 'get_tournament_history', 'join_room',
    'leave_room', 'open_next_round', 'open_penalty', 'quick_play', 'ranked_cancel', 'ranked_enqueue',
    'ranked_poll', 'resolve_penalty', 'select_option', 'username_available',
    -- helpers de pertenencia que evalúan las policies RLS
    'is_match_member', 'is_room_member', 'is_tournament_member', 'realtime_match_member',
    'realtime_tournament_member'
  ];
  anon_allow text[] := array['username_available'];
begin
  for r in
    select p.oid::regprocedure as fn, p.proname
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace and p.prokind in ('f', 'p')
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', r.fn);
    if r.proname = any (auth_allow) then
      execute format('grant execute on function %s to authenticated', r.fn);
    end if;
    if r.proname = any (anon_allow) then
      execute format('grant execute on function %s to anon', r.fn);
    end if;
  end loop;
end $$;

-- Y que las funciones NUEVAS no nazcan ejecutables por el cliente: cada RPC de cliente se otorga en su
-- migración (y se suma a la allowlist de rls_audit).
alter default privileges for role postgres in schema public revoke execute on functions from public, anon, authenticated;
