-- Grants explícitos de las lecturas/escrituras DIRECTAS del cliente (PostgREST), una por policy RLS.
--
-- Hasta acá dependían del default ACL de la plataforma: en prod (proyecto viejo) las tablas nuevas de
-- `postgres` nacían con todos los privilegios para anon/authenticated, pero el Supabase local actual
-- (y el baseline v2) trae un default restringido (solo REFERENCES/TRIGGER/TRUNCATE/MAINTAIN) → sin
-- estos grants la app local no puede leer su propio perfil ni la sala (lo destapó el e2e de flujo).
-- Idempotente: si prod ya los tiene, no cambia nada.
--
-- Fuera de acá a propósito: penalties, penalty_answers, questions, matches, tournament_questions,
-- bot_intents, rate_limits y ranked_* → solo por RPC SECURITY DEFINER (anti-trampa: `correct_index`
-- nunca viaja al cliente). `game_modes` ya tiene su grant (20261114000000_game_modes).
grant select on table
  public.profiles,
  public.rooms,
  public.participants,
  public.tournaments,
  public.teams
to authenticated;

-- Perfil propio (policy profiles_update_own): solo lo que edita la app (registro y avatar).
grant update (username, avatar) on table public.profiles to authenticated;
