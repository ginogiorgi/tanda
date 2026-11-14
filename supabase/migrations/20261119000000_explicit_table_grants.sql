-- Grants explícitos de las lecturas/escrituras DIRECTAS del cliente (PostgREST), una por policy RLS.
--
-- Hasta acá dependían del default ACL de la plataforma: en prod (proyecto viejo) las tablas nuevas de
-- `postgres` nacían con todos los privilegios para anon/authenticated, pero el Supabase local actual
-- (y el baseline v2) trae un default restringido (solo REFERENCES/TRIGGER/TRUNCATE/MAINTAIN) → sin
-- estos grants la app local no puede leer su propio perfil ni la sala (lo destapó el e2e de flujo).
-- Además deja prod == repo: prod tenía SELECT/INSERT/UPDATE/DELETE para anon Y authenticated sobre TODAS
-- las tablas de juego (default ACL viejo; consulta del 14/11). RLS sin policy igual las bloqueaba, pero el
-- grant era la única barrera que faltaba → primero `revoke all` en todas las tablas de `public` (también
-- borra TRUNCATE/REFERENCES/TRIGGER/MAINTAIN del default local; TRUNCATE saltea RLS) y después se dan
-- solo los grants de abajo. Idempotente.
--
-- Fuera de acá a propósito: penalties, penalty_answers, questions, matches, tournament_questions,
-- bot_intents, rate_limits y ranked_* → solo por RPC SECURITY DEFINER (anti-trampa: `correct_index`
-- nunca viaja al cliente). `game_modes` se re-otorga abajo (venía de 20261114000000_game_modes).
do $$
declare r record;
begin
  for r in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm')
  loop
    execute format('revoke all on table public.%I from anon, authenticated', r.relname);
  end loop;
end $$;

-- Y que las tablas NUEVAS tampoco nazcan abiertas: prod conservaba el default ACL viejo para `postgres`
-- (arwdDxtm a anon/authenticated). Desde acá toda tabla que el cliente lea directo necesita su grant
-- explícito en la migración que la crea (el test (d) de rls_audit lo exige).
alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated;

-- Catálogo de modos: lo lee también el landing sin sesión (policy game_modes_select_all).
grant select on table public.game_modes to anon, authenticated;

grant select on table
  public.profiles,
  public.rooms,
  public.participants,
  public.tournaments,
  public.teams
to authenticated;

-- Perfil propio (policy profiles_update_own): solo lo que edita la app (registro y avatar).
grant update (username, avatar) on table public.profiles to authenticated;
