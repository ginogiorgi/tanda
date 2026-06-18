


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE EXTENSION IF NOT EXISTS "pg_cron" WITH SCHEMA "pg_catalog";






CREATE EXTENSION IF NOT EXISTS "pg_net" WITH SCHEMA "extensions";






COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE TYPE "public"."answer_phase" AS ENUM (
    'first',
    'second_chance'
);


ALTER TYPE "public"."answer_phase" OWNER TO "postgres";


CREATE TYPE "public"."difficulty" AS ENUM (
    'easy',
    'medium',
    'hard',
    'very_hard'
);


ALTER TYPE "public"."difficulty" OWNER TO "postgres";


CREATE TYPE "public"."difficulty_tier" AS ENUM (
    'elite',
    'high',
    'medium',
    'low'
);


ALTER TYPE "public"."difficulty_tier" OWNER TO "postgres";


CREATE TYPE "public"."match_phase" AS ENUM (
    'group',
    'round_of_32',
    'round_of_16',
    'quarters',
    'semis',
    'third_place',
    'final'
);


ALTER TYPE "public"."match_phase" OWNER TO "postgres";


CREATE TYPE "public"."match_status" AS ENUM (
    'pending',
    'in_progress',
    'sudden_death',
    'finished'
);


ALTER TYPE "public"."match_status" OWNER TO "postgres";


CREATE TYPE "public"."penalty_status" AS ENUM (
    'pending',
    'open',
    'second_chance',
    'resolved'
);


ALTER TYPE "public"."penalty_status" OWNER TO "postgres";


CREATE TYPE "public"."room_status" AS ENUM (
    'lobby',
    'starting',
    'in_progress',
    'finished',
    'cancelled'
);


ALTER TYPE "public"."room_status" OWNER TO "postgres";


CREATE TYPE "public"."tournament_phase" AS ENUM (
    'groups',
    'round_of_32',
    'round_of_16',
    'quarters',
    'semis',
    'final',
    'finished'
);


ALTER TYPE "public"."tournament_phase" OWNER TO "postgres";


CREATE TYPE "public"."tournament_status" AS ENUM (
    'pending',
    'in_progress',
    'finished'
);


ALTER TYPE "public"."tournament_status" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."abandon"("p_match" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  uid uuid := (select auth.uid());
  v_tournament uuid; v_part uuid; r record;
begin
  if uid is null then raise exception 'unauthenticated'; end if;
  perform public.enforce_rate_limit('abandon', 5, interval '1 minute');

  select tournament_id into v_tournament from public.matches where id = p_match;
  if v_tournament is null then raise exception 'match_not_found'; end if;

  select id into v_part from public.participants
    where tournament_id = v_tournament and user_id = uid and is_bot = false;
  if v_part is null then raise exception 'not_participant'; end if;

  update public.participants set is_bot = true, abandoned = true where id = v_part;

  -- Penales en curso donde patea/ataja → ahora los juega el bot (precompute si no respondió).
  for r in
    select pe.id from public.penalties pe
    join public.matches m on m.id = pe.match_id
    where m.tournament_id = v_tournament
      and pe.status in ('open', 'second_chance')
      and (pe.kicker_participant_id = v_part or pe.keeper_participant_id = v_part)
  loop
    perform public.precompute_bot_intents(r.id);
  end loop;
end;
$$;


ALTER FUNCTION "public"."abandon"("p_match" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."advance_ko_round"("p_tournament" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_phase public.tournament_phase; v_cur public.match_phase; v_next public.tournament_phase;
  v_next_match public.match_phase;
  v_room uuid;
  v_champ uuid; v_runner uuid; v_third uuid; v_fourth uuid;
begin
  select current_phase into v_phase from public.tournaments
    where id = p_tournament and status = 'in_progress';
  if v_phase is null then return; end if;

  -- ── Final + 3er puesto terminados → coronar y cerrar. ──
  if v_phase = 'final' then
    if exists (select 1 from public.matches
               where tournament_id = p_tournament and phase in ('final', 'third_place')
                 and status <> 'finished') then
      return;
    end if;

    select winner_participant_id,
           case when winner_participant_id = home_participant_id then away_participant_id else home_participant_id end
      into v_champ, v_runner
      from public.matches where tournament_id = p_tournament and phase = 'final';
    select winner_participant_id,
           case when winner_participant_id = home_participant_id then away_participant_id else home_participant_id end
      into v_third, v_fourth
      from public.matches where tournament_id = p_tournament and phase = 'third_place';

    update public.participants set placement = 1 where id = v_champ;
    update public.participants set placement = 2, eliminated_phase = 'final' where id = v_runner;
    update public.participants set placement = 3 where id = v_third;
    update public.participants set placement = 4, eliminated_phase = 'third_place' where id = v_fourth;

    update public.tournaments
      set status = 'finished', current_phase = 'finished',
          champion_participant_id = v_champ, third_place_participant_id = v_third
      where id = p_tournament;

    select room_id into v_room from public.tournaments where id = p_tournament;
    update public.rooms set status = 'finished' where id = v_room;
    return;
  end if;

  v_cur := v_phase::text::public.match_phase;
  v_next := case v_phase
    when 'round_of_32' then 'round_of_16'
    when 'round_of_16' then 'quarters'
    when 'quarters'    then 'semis'
    when 'semis'       then 'final'
  end;
  v_next_match := v_next::text::public.match_phase;

  if not exists (select 1 from public.matches
                 where tournament_id = p_tournament and phase = v_next_match) then
    -- ganadores en orden de bracket → emparejar 2k vs 2k+1 (advanceBracket).
    insert into public.matches
      (tournament_id, phase, bracket_slot, home_participant_id, away_participant_id, is_bot_only, status)
    with w as (
      select winner_participant_id as wid,
             row_number() over (order by bracket_slot) - 1 as ord
      from public.matches
      where tournament_id = p_tournament and phase = v_cur and status = 'finished'
    )
    select p_tournament, v_next_match, (h.ord / 2)::int, h.wid, a.wid,
      ((select is_bot from public.participants where id = h.wid)
         and (select is_bot from public.participants where id = a.wid)),
      'pending'
    from w h join w a on a.ord = h.ord + 1 and h.ord % 2 = 0;

    -- semis → 3er puesto con los perdedores (no se marcan eliminados; juegan otra vez).
    if v_phase = 'semis' then
      insert into public.matches
        (tournament_id, phase, bracket_slot, home_participant_id, away_participant_id, is_bot_only, status)
      with l as (
        select case when winner_participant_id = home_participant_id
                    then away_participant_id else home_participant_id end as lid,
               row_number() over (order by bracket_slot) - 1 as ord
        from public.matches
        where tournament_id = p_tournament and phase = 'semis' and status = 'finished'
      )
      select p_tournament, 'third_place', 0, h.lid, a.lid,
        ((select is_bot from public.participants where id = h.lid)
           and (select is_bot from public.participants where id = a.lid)),
        'pending'
      from l h join l a on a.ord = h.ord + 1 and h.ord % 2 = 0;
    else
      -- rondas previas a semis: los perdedores quedan eliminados en esta fase.
      update public.participants set eliminated_phase = v_cur
      where id in (
        select case when winner_participant_id = home_participant_id
                    then away_participant_id else home_participant_id end
        from public.matches
        where tournament_id = p_tournament and phase = v_cur and status = 'finished'
      );
    end if;
  end if;

  update public.tournaments set current_phase = v_next
    where id = p_tournament and current_phase = v_phase;
end;
$$;


ALTER FUNCTION "public"."advance_ko_round"("p_tournament" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."advance_tournament"("p_tournament" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare v_phase public.tournament_phase; v_pending int; v_total int; v_unfinished int;
begin
  loop
    select current_phase into v_phase from public.tournaments
      where id = p_tournament and status = 'in_progress';
    if v_phase is null then return; end if;

    if v_phase = 'groups' then
      if exists (select 1 from public.matches
                 where tournament_id = p_tournament and phase = 'group'
                   and status in ('in_progress', 'sudden_death')) then
        return;  -- jornada en curso
      end if;
      if exists (select 1 from public.matches
                 where tournament_id = p_tournament and phase = 'group' and status = 'pending') then
        perform public.open_round(p_tournament);  -- abre la próxima jornada
        continue;
      else
        perform public.build_knockout(p_tournament);  -- grupos completos → arma el bracket
        continue;
      end if;
    end if;

    -- Fases de eliminación (la 'final' incluye el 3er puesto).
    if exists (select 1 from public.matches m
               where m.tournament_id = p_tournament and m.status in ('in_progress', 'sudden_death')
                 and (m.phase::text = v_phase::text or (v_phase = 'final' and m.phase = 'third_place'))) then
      return;  -- partido en curso
    end if;

    select count(*) filter (where status = 'pending'),
           count(*),
           count(*) filter (where status <> 'finished')
      into v_pending, v_total, v_unfinished
      from public.matches m
      where m.tournament_id = p_tournament
        and (m.phase::text = v_phase::text or (v_phase = 'final' and m.phase = 'third_place'));

    if v_total = 0 then
      return;  -- defensivo: la fase aún no tiene matches
    elsif v_pending > 0 then
      perform public.open_round(p_tournament);  -- abre los pendientes (bot-only al instante)
      continue;
    elsif v_unfinished = 0 then
      perform public.advance_ko_round(p_tournament);  -- ronda completa → siguiente / corona
      continue;
    else
      return;
    end if;
  end loop;
end;
$$;


ALTER FUNCTION "public"."advance_tournament"("p_tournament" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."assign_round_question"("p_match" "uuid", "p_idx" integer) RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_tournament uuid; v_phase public.match_phase; v_slot int; v_seed bigint;
  v_q uuid; v_diff public.difficulty;
begin
  select m.tournament_id, m.phase, m.bracket_slot, t.seed
    into v_tournament, v_phase, v_slot, v_seed
    from public.matches m join public.tournaments t on t.id = m.tournament_id
    where m.id = p_match;

  select pe.question_id into v_q
    from public.penalties pe join public.matches m2 on m2.id = pe.match_id
    where m2.tournament_id = v_tournament and m2.phase = v_phase
      and (v_phase <> 'group' or m2.bracket_slot is not distinct from v_slot)
      and pe.idx = p_idx and pe.question_id is not null
    limit 1;
  if v_q is not null then return v_q; end if;

  v_diff := public.tanda_penalty_difficulty(v_phase, p_idx);
  v_q := public.take_tournament_question(
    v_tournament, v_diff,
    (coalesce(v_seed, 0) # public.engine_hash32(v_phase::text || ':' || coalesce(v_slot, 0) || ':' || p_idx)) & 4294967295
  );
  return v_q;
end;
$$;


ALTER FUNCTION "public"."assign_round_question"("p_match" "uuid", "p_idx" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."bot_penalty_scored"("p_seedp" bigint, "p_k_tier" "public"."difficulty_tier", "p_g_tier" "public"."difficulty_tier", "p_kicker" "uuid", "p_keeper" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" IMMUTABLE
    SET "search_path" TO ''
    AS $$
declare
  mask constant bigint := 4294967295;
  ks bigint; gs bigint; kwc boolean; kdl int; gwc boolean; gdl int;
begin
  -- Primera fase.
  ks := (p_seedp # public.engine_hash32(p_kicker::text || ':first')) & mask;
  gs := (p_seedp # public.engine_hash32(p_keeper::text || ':first')) & mask;
  select will_be_correct, delay_ms into kwc, kdl from public.engine_bot_intent(p_k_tier, ks);
  select will_be_correct, delay_ms into gwc, gdl from public.engine_bot_intent(p_g_tier, gs);
  if kwc and gwc then
    if kdl < gdl then return true; elsif gdl < kdl then return false;
    else return public.engine_rand_bool(p_seedp); end if;
  elsif kwc then return true;       -- pateador acierta, arquero no → gol
  elsif gwc then return false;      -- arquero acierta, pateador no → atajada
  end if;

  -- "Los dos mal" → segunda chance.
  ks := (p_seedp # public.engine_hash32(p_kicker::text || ':second_chance')) & mask;
  gs := (p_seedp # public.engine_hash32(p_keeper::text || ':second_chance')) & mask;
  select will_be_correct, delay_ms into kwc, kdl from public.engine_bot_intent(p_k_tier, ks);
  select will_be_correct, delay_ms into gwc, gdl from public.engine_bot_intent(p_g_tier, gs);
  if kwc and gwc then
    if kdl < gdl then return true; elsif gdl < kdl then return false;
    else return public.engine_rand_bool(p_seedp); end if;
  elsif kwc then return true;
  end if;
  return false;  -- erró de nuevo / solo el arquero acertó → gana el arquero
end;
$$;


ALTER FUNCTION "public"."bot_penalty_scored"("p_seedp" bigint, "p_k_tier" "public"."difficulty_tier", "p_g_tier" "public"."difficulty_tier", "p_kicker" "uuid", "p_keeper" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."build_knockout"("p_tournament" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_seed bigint;
  letter text; rec record;
  q_team uuid[] := '{}'; q_group text[] := '{}'; q_slot int[] := '{}';
  t_team uuid[] := '{}'; t_group text[] := '{}';
  t_pts int[] := '{}'; t_gd int[] := '{}'; t_gf int[] := '{}';
  n_third int; k int;
  win_team uuid[]; win_group text[]; pool_team uuid[]; pool_group text[];
  m_home uuid[] := '{}'; m_away uuid[] := '{}';
  i int; j int; a_team uuid; a_group text;
begin
  -- idempotencia: si ya existe el bracket, no rehacer.
  if exists (select 1 from public.matches
             where tournament_id = p_tournament and phase = 'round_of_32') then
    return;
  end if;

  select seed into v_seed from public.tournaments where id = p_tournament;

  -- 1º/2º de cada grupo → qualified; 3º → al pool de terceros; 4º → eliminado en grupos.
  for letter in
    select distinct group_letter from public.participants
    where tournament_id = p_tournament and group_letter is not null
    order by 1
  loop
    for rec in select * from public.engine_group_standings(p_tournament, letter) loop
      if rec.rank <= 2 then
        q_team := q_team || rec.participant_id; q_group := q_group || letter; q_slot := q_slot || rec.rank;
      elsif rec.rank = 3 then
        t_team := t_team || rec.participant_id; t_group := t_group || letter;
        t_pts := t_pts || rec.pts; t_gd := t_gd || rec.gd; t_gf := t_gf || rec.gf;
      else
        update public.participants set eliminated_phase = 'group' where id = rec.participant_id;
      end if;
    end loop;
  end loop;

  -- 8 mejores terceros (puntos → dif. gol → goles a favor → sorteo); resto eliminados.
  n_third := coalesce(array_length(t_team, 1), 0);
  k := 0;
  for rec in
    select team, grp from unnest(t_team, t_group, t_pts, t_gd, t_gf) as u(team, grp, pts, gd, gf)
    order by pts desc, gd desc, gf desc,
      public.engine_mulberry32((v_seed # public.engine_fnv32(team::text)) & 4294967295)
  loop
    k := k + 1;
    if k <= 8 then
      q_team := q_team || rec.team; q_group := q_group || rec.grp; q_slot := q_slot || 3;
    else
      update public.participants set eliminated_phase = 'group' where id = rec.team;
    end if;
  end loop;

  -- buildRoundOf32: ganadores (slot 1) y pool (2º/3º), ambos ordenados por drawKey asc.
  select array_agg(team order by dk) filter (where slot = 1),
         array_agg(grp  order by dk) filter (where slot = 1),
         array_agg(team order by dk) filter (where slot <> 1),
         array_agg(grp  order by dk) filter (where slot <> 1)
    into win_team, win_group, pool_team, pool_group
  from (
    select team, grp, slot,
      public.engine_mulberry32((v_seed # public.engine_fnv32(team::text)) & 4294967295) as dk
    from unnest(q_team, q_group, q_slot) as u(team, grp, slot)
  ) s;

  -- cada ganador de grupo vs el primer disponible de OTRO grupo (si no hay, el primero).
  for i in 1 .. coalesce(array_length(win_team, 1), 0) loop
    j := coalesce((
      select min(idx) from generate_subscripts(pool_group, 1) idx where pool_group[idx] <> win_group[i]
    ), 1);
    m_home := m_home || win_team[i]; m_away := m_away || pool_team[j];
    pool_team  := pool_team[1:j-1]  || pool_team[j+1:];
    pool_group := pool_group[1:j-1] || pool_group[j+1:];
  end loop;

  -- restantes del pool, emparejados también evitando mismo grupo (shift + take-different).
  while coalesce(array_length(pool_team, 1), 0) > 0 loop
    a_team := pool_team[1]; a_group := pool_group[1];
    pool_team := pool_team[2:]; pool_group := pool_group[2:];
    j := coalesce((
      select min(idx) from generate_subscripts(pool_group, 1) idx where pool_group[idx] <> a_group
    ), 1);
    m_home := m_home || a_team; m_away := m_away || pool_team[j];
    pool_team  := pool_team[1:j-1]  || pool_team[j+1:];
    pool_group := pool_group[1:j-1] || pool_group[j+1:];
  end loop;

  -- 16 cruces de round_of_32 en orden de bracket (bracket_slot 0..15).
  insert into public.matches
    (tournament_id, phase, bracket_slot, home_participant_id, away_participant_id, is_bot_only, status)
  select p_tournament, 'round_of_32', g.gi - 1, m_home[g.gi], m_away[g.gi],
    ((select is_bot from public.participants where id = m_home[g.gi])
       and (select is_bot from public.participants where id = m_away[g.gi])),
    'pending'
  from generate_series(1, coalesce(array_length(m_home, 1), 0)) as g(gi);

  update public.tournaments set current_phase = 'round_of_32' where id = p_tournament;
end;
$$;


ALTER FUNCTION "public"."build_knockout"("p_tournament" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cleanup_stale_rooms"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  delete from public.rooms
    where status = 'cancelled' and created_at < now() - interval '1 day';
end;
$$;


ALTER FUNCTION "public"."cleanup_stale_rooms"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_room"() RETURNS TABLE("room_id" "uuid", "tournament_id" "uuid", "code" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  uid uuid := (select auth.uid());
  v_room uuid;
  v_tournament uuid;
  v_code text;
begin
  if uid is null then raise exception 'unauthenticated'; end if;
  perform public.enforce_rate_limit('create_room', 10, interval '1 minute');
  v_code := public.gen_room_code();
  insert into public.rooms (code, host_id, status, starts_at)
    values (v_code, uid, 'lobby', now() + interval '2 minutes')
    returning id into v_room;
  insert into public.tournaments (room_id, status, current_phase, seed)
    values (v_room, 'pending', 'groups', (random() * 9.2e18)::bigint)
    returning id into v_tournament;
  insert into public.participants (tournament_id, user_id, is_bot)
    values (v_tournament, uid, false);
  return query select v_room, v_tournament, v_code;
end;
$$;


ALTER FUNCTION "public"."create_room"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."emit_score_live"("p_match" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare v record;
begin
  select m.tournament_id as tid, m.id as mid, m.phase, m.group_letter, m.bracket_slot, m.status,
         m.home_score, m.away_score, m.winner_participant_id,
         m.home_participant_id as home, m.away_participant_id as away
    into v from public.matches m where m.id = p_match;
  if v.tid is null then return; end if;

  perform realtime.send(
    jsonb_build_object(
      'match_id', v.mid, 'phase', v.phase, 'group_letter', v.group_letter,
      'bracket_slot', v.bracket_slot, 'status', v.status,
      'home_score', v.home_score, 'away_score', v.away_score,
      'winner_participant_id', v.winner_participant_id,
      'home', public.participant_brief(v.home),
      'away', public.participant_brief(v.away),
      'server_now', now()
    ),
    'score:live', 'tournament:' || v.tid::text, true
  );
end;
$$;


ALTER FUNCTION "public"."emit_score_live"("p_match" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enforce_rate_limit"("p_action" "text", "p_max" integer, "p_window" interval) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  uid uuid := (select auth.uid());
  v_count int;
begin
  -- Sin sesión no llega acá (las RPC ya cortan en unauthenticated); el backstop/cron tampoco.
  if uid is null then return; end if;

  insert into public.rate_limits as rl (user_id, action, window_start, count)
    values (uid, p_action, now(), 1)
  on conflict (user_id, action) do update
    set count = case when rl.window_start < now() - p_window then 1 else rl.count + 1 end,
        window_start = case when rl.window_start < now() - p_window then now() else rl.window_start end
  returning rl.count into v_count;

  if v_count > p_max then raise exception 'rate_limited'; end if;
end;
$$;


ALTER FUNCTION "public"."enforce_rate_limit"("p_action" "text", "p_max" integer, "p_window" interval) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."engine_advance_match"("p_kind" "text", "p_scored" boolean[], OUT "status" "text", OUT "next_index" integer, OUT "next_kicker" "text", OUT "home" integer, OUT "away" integer, OUT "winner" "text") RETURNS "record"
    LANGUAGE "plpgsql" IMMUTABLE
    SET "search_path" TO ''
    AS $$
declare
  n int := coalesce(array_length(p_scored, 1), 0);
  hk int := 0; ak int := 0; i int; home_rem int; away_rem int; sdk int;
  kps int := case when p_kind = 'group' then 3 else 5 end;  -- penales por lado (10.4)
  reg int := (case when p_kind = 'group' then 3 else 5 end) * 2;
begin
  home := 0; away := 0;
  for i in 1..n loop
    if i % 2 = 1 then
      hk := hk + 1; if p_scored[i] then home := home + 1; end if;
    else
      ak := ak + 1; if p_scored[i] then away := away + 1; end if;
    end if;
  end loop;

  -- Regulación en curso: corte por resultado decidido en AMBAS fases (10.9).
  if n < reg then
    home_rem := kps - hk; away_rem := kps - ak;
    if home > away + away_rem or away > home + home_rem then
      status := 'finished'; winner := case when home > away then 'home' else 'away' end; return;
    end if;
    status := 'in_progress'; next_index := n + 1;
    next_kicker := case when (n + 1) % 2 = 1 then 'home' else 'away' end; return;
  end if;

  -- Fin de regulación (n = reg).
  if n = reg then
    if home <> away then
      status := 'finished'; winner := case when home > away then 'home' else 'away' end; return;
    end if;
    if p_kind = 'group' then status := 'finished'; winner := null; return; end if;  -- empate OK
    status := 'sudden_death'; next_index := n + 1;
    next_kicker := case when (n + 1) % 2 = 1 then 'home' else 'away' end; return;
  end if;

  -- Muerte súbita (n > reg, solo eliminación): se decide al cerrar una ronda completa.
  sdk := n - reg;
  if sdk % 2 = 0 and home <> away then
    status := 'finished'; winner := case when home > away then 'home' else 'away' end; return;
  end if;
  status := 'sudden_death'; next_index := n + 1;
  next_kicker := case when (n + 1) % 2 = 1 then 'home' else 'away' end;
end;
$$;


ALTER FUNCTION "public"."engine_advance_match"("p_kind" "text", "p_scored" boolean[], OUT "status" "text", OUT "next_index" integer, OUT "next_kicker" "text", OUT "home" integer, OUT "away" integer, OUT "winner" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."engine_bot_intent"("p_tier" "public"."difficulty_tier", "p_seed" bigint, OUT "will_be_correct" boolean, OUT "delay_ms" integer) RETURNS "record"
    LANGUAGE "plpgsql" IMMUTABLE
    SET "search_path" TO ''
    AS $$
declare
  mask constant bigint := 4294967295;
  delay_salt constant bigint := 2654435769;  -- 0x9e3779b9
  acc numeric; min_d int; max_d int; delay_seed bigint;
begin
  case p_tier
    when 'elite'  then acc := 0.8; min_d := 4000; max_d := 7000;
    when 'high'   then acc := 0.7; min_d := 4000; max_d := 8000;
    when 'medium' then acc := 0.6; min_d := 4000; max_d := 9000;
    else               acc := 0.5; min_d := 4000; max_d := 10000;  -- low
  end case;
  will_be_correct := public.engine_mulberry32(p_seed) < acc * 4294967296;
  delay_seed := (p_seed # delay_salt) & mask;
  delay_ms := min_d + public.engine_rand_int(delay_seed, max_d - min_d + 1);
end;
$$;


ALTER FUNCTION "public"."engine_bot_intent"("p_tier" "public"."difficulty_tier", "p_seed" bigint, OUT "will_be_correct" boolean, OUT "delay_ms" integer) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."engine_bot_intent"("p_tier" "public"."difficulty_tier", "p_seed" bigint, OUT "will_be_correct" boolean, OUT "delay_ms" integer) IS 'Port SQL de lib/engine/bot.ts botIntent (§7.2). Verificado por paridad bit-perfect.';



CREATE OR REPLACE FUNCTION "public"."engine_fnv32"("p_text" "text") RETURNS bigint
    LANGUAGE "plpgsql" IMMUTABLE
    SET "search_path" TO ''
    AS $$
declare h bigint := 2166136261; i int; n int := length(p_text);
begin
  for i in 1..n loop
    h := (h # ascii(substr(p_text, i, 1))) & 4294967295;
    h := public.engine_imul(h, 16777619);
  end loop;
  return h & 4294967295;
end;
$$;


ALTER FUNCTION "public"."engine_fnv32"("p_text" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."engine_group_standings"("p_tournament" "uuid", "p_group" "text") RETURNS TABLE("participant_id" "uuid", "rank" integer, "pts" integer, "gd" integer, "gf" integer)
    LANGUAGE "plpgsql" STABLE
    SET "search_path" TO ''
    AS $$
declare v_seed bigint;
begin
  select t.seed into v_seed from public.tournaments t where t.id = p_tournament;

  return query
  with mr as (
    select m.home_participant_id as a, m.away_participant_id as b,
           m.home_score as hs, m.away_score as as_
    from public.matches m
    where m.tournament_id = p_tournament and m.phase = 'group'
      and m.group_letter = p_group and m.status = 'finished'
  ),
  perteam as (
    select a as team, b as opp, hs as gf_, as_ as ga_ from mr
    union all
    select b as team, a as opp, as_ as gf_, hs as ga_ from mr
  ),
  teams as (
    select pa.id from public.participants pa
    where pa.tournament_id = p_tournament and pa.group_letter = p_group
  ),
  base as (
    select tm.id as team,
      coalesce(sum(p.gf_), 0)::int as gf,
      coalesce(sum(p.gf_ - p.ga_), 0)::int as gd,
      coalesce(sum(case when p.gf_ > p.ga_ then 3 when p.gf_ = p.ga_ then 1 else 0 end), 0)::int as pts
    from teams tm left join perteam p on p.team = tm.id
    group by tm.id
  ),
  ranked as (
    select b.*, rank() over (order by b.pts desc, b.gd desc, b.gf desc) as orank
    from base b
  ),
  h2h as (
    select r.team,
      coalesce(sum(case when p.gf_ > p.ga_ then 3 when p.gf_ = p.ga_ then 1 else 0 end), 0)::int as hpts,
      coalesce(sum(p.gf_ - p.ga_), 0)::int as hgd,
      coalesce(sum(p.gf_), 0)::int as hgf
    from ranked r
    left join perteam p on p.team = r.team
      and p.opp in (select r2.team from ranked r2 where r2.orank = r.orank)
    group by r.team
  )
  select r.team,
    (row_number() over (order by r.orank,
        h.hpts desc, h.hgd desc, h.hgf desc,
        public.engine_mulberry32((v_seed # public.engine_fnv32(r.team::text)) & 4294967295)))::int,
    r.pts, r.gd, r.gf
  from ranked r join h2h h on h.team = r.team;
end;
$$;


ALTER FUNCTION "public"."engine_group_standings"("p_tournament" "uuid", "p_group" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."engine_hash32"("p_text" "text") RETURNS bigint
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO ''
    AS $$
  select ('x' || substr(md5(p_text), 1, 8))::bit(32)::bigint;
$$;


ALTER FUNCTION "public"."engine_hash32"("p_text" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."engine_imul"("x" bigint, "y" bigint) RETURNS bigint
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO ''
    AS $$
  select (((x & 4294967295)::numeric * (y & 4294967295)::numeric) % 4294967296)::bigint;
$$;


ALTER FUNCTION "public"."engine_imul"("x" bigint, "y" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."engine_mulberry32"("p_seed" bigint) RETURNS bigint
    LANGUAGE "plpgsql" IMMUTABLE
    SET "search_path" TO ''
    AS $$
declare
  mask constant bigint := 4294967295;  -- 2^32 - 1
  a bigint; t bigint; x bigint;
begin
  a := ((p_seed & mask) + 1831565813) & mask;          -- a = (seed + 0x6d2b79f5) | 0
  x := (a # (a >> 15)) & mask;                          -- a ^ (a >>> 15)
  t := public.engine_imul(x, 1 | a) & mask;             -- imul(_, 1 | a)
  x := (t # (t >> 7)) & mask;                           -- t ^ (t >>> 7)
  t := (((t + public.engine_imul(x, 61 | t)) & mask) # t) & mask; -- (t + imul(_, 61|t)) ^ t
  return (t # (t >> 14)) & mask;                        -- (t ^ (t >>> 14)) >>> 0
end;
$$;


ALTER FUNCTION "public"."engine_mulberry32"("p_seed" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."engine_rand_bool"("p_seed" bigint) RETURNS boolean
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO ''
    AS $$
  select public.engine_mulberry32(p_seed) < 2147483648;
$$;


ALTER FUNCTION "public"."engine_rand_bool"("p_seed" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."engine_rand_int"("p_seed" bigint, "p_n" integer) RETURNS integer
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO ''
    AS $$
  select (public.engine_mulberry32(p_seed) * p_n / 4294967296)::int;
$$;


ALTER FUNCTION "public"."engine_rand_int"("p_seed" bigint, "p_n" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."finalize_match"("p_match" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_phase public.match_phase; v_kind text; v_home uuid; v_away uuid; v_status public.match_status;
  v_scored boolean[]; st record;
begin
  select phase, home_participant_id, away_participant_id, status
    into v_phase, v_home, v_away, v_status
    from public.matches where id = p_match;
  if v_status = 'finished' then return; end if;
  v_kind := case when v_phase = 'group' then 'group' else 'elimination' end;

  select coalesce(array_agg((resolution->>'scored')::boolean order by idx), '{}')
    into v_scored
    from public.penalties where match_id = p_match and status = 'resolved';

  select * into st from public.engine_advance_match(v_kind, v_scored);

  if st.status = 'finished' then
    update public.matches
      set status = 'finished',
          winner_participant_id = case st.winner when 'home' then v_home when 'away' then v_away else null end
      where id = p_match;
  else
    update public.matches
      set status = case when st.status = 'sudden_death' then 'sudden_death'::public.match_status
                        else 'in_progress'::public.match_status end
      where id = p_match and status <> 'finished';
  end if;
end;
$$;


ALTER FUNCTION "public"."finalize_match"("p_match" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."gen_room_code"() RETURNS "text"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
declare
  alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_code text;
  i int;
begin
  loop
    v_code := '';
    for i in 1..6 loop
      v_code := v_code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from public.rooms r where r.code = v_code);
  end loop;
  return v_code;
end;
$$;


ALTER FUNCTION "public"."gen_room_code"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_active_match"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  uid uuid := (select auth.uid());
  v_match record;
  v_pen record;
  v_my_option int;
  v_phase public.answer_phase;
begin
  if uid is null then raise exception 'unauthenticated'; end if;

  select m.id as match_id, m.tournament_id, m.phase, m.home_score, m.away_score
    into v_match
    from public.matches m
    join public.tournaments t on t.id = m.tournament_id
    join public.participants p on p.id in (m.home_participant_id, m.away_participant_id)
    where p.user_id = uid
      and p.is_bot = false
      and t.status = 'in_progress'
      and m.status in ('in_progress', 'sudden_death')
    order by m.created_at desc
    limit 1;
  if v_match.match_id is null then return null; end if;

  select pe.id, pe.idx, pe.status, pe.started_at, pe.deadline, pe.removed_option,
         pe.kicker_participant_id, pe.keeper_participant_id, q.prompt, q.options
    into v_pen
    from public.penalties pe
    join public.questions q on q.id = pe.question_id
    where pe.match_id = v_match.match_id and pe.status in ('open', 'second_chance')
    order by pe.idx desc
    limit 1;

  if v_pen.id is not null then
    v_phase := case v_pen.status when 'open' then 'first' else 'second_chance' end;
    select pa.option_index into v_my_option
      from public.penalty_answers pa
      join public.participants p on p.id = pa.participant_id
      where pa.penalty_id = v_pen.id and p.user_id = uid and pa.phase = v_phase;
  end if;

  return jsonb_build_object(
    'match_id', v_match.match_id,
    'tournament_id', v_match.tournament_id,
    'phase', v_match.phase,
    'home_score', v_match.home_score,
    'away_score', v_match.away_score,
    'penal', case when v_pen.id is null then null else jsonb_build_object(
      'penalty_id', v_pen.id,
      'match_id', v_match.match_id,
      'idx', v_pen.idx,
      'prompt', v_pen.prompt,
      'options', v_pen.options,
      'removed_option', v_pen.removed_option,
      'phase', v_phase,
      'started_at', v_pen.started_at,
      'deadline', v_pen.deadline,
      'server_now', now(),
      'my_option', v_my_option,
      'kicker_participant_id', v_pen.kicker_participant_id,
      'keeper_participant_id', v_pen.keeper_participant_id
    ) end
  );
end;
$$;


ALTER FUNCTION "public"."get_active_match"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_active_tournament"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  uid uuid := (select auth.uid());
  v_tournament uuid; v_part uuid;
begin
  if uid is null then raise exception 'unauthenticated'; end if;

  select t.id, p.id into v_tournament, v_part
    from public.tournaments t
    join public.participants p on p.tournament_id = t.id
    where p.user_id = uid and p.is_bot = false
      and t.status = 'in_progress'
      and p.eliminated_phase is null and p.placement is null
    order by t.created_at desc
    limit 1;

  if v_tournament is null then return null; end if;
  return jsonb_build_object('tournament_id', v_tournament, 'my_participant_id', v_part);
end;
$$;


ALTER FUNCTION "public"."get_active_tournament"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_bracket"("p_tournament" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  uid uuid := (select auth.uid());
  v_my uuid;
begin
  if uid is null then raise exception 'unauthenticated'; end if;
  if not public.is_tournament_member(p_tournament) then
    raise exception 'not_tournament_member';
  end if;

  select id into v_my from public.participants
    where tournament_id = p_tournament and user_id = uid and is_bot = false limit 1;

  return jsonb_build_object(
    'tournament_id', p_tournament,
    'my_participant_id', v_my,
    'current_phase', (select current_phase from public.tournaments where id = p_tournament),
    'round_deadline', (select round_deadline from public.tournaments where id = p_tournament),
    'champion_participant_id',
      (select champion_participant_id from public.tournaments where id = p_tournament),
    'participants', (
      select coalesce(jsonb_agg(
        public.participant_brief(p.id)
        || jsonb_build_object(
             'group_letter', p.group_letter,
             'placement', p.placement,
             'eliminated_phase', p.eliminated_phase
           )
        order by p.group_letter, p.id
      ), '[]'::jsonb)
      from public.participants p where p.tournament_id = p_tournament
    ),
    'matches', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'match_id', m.id,
        'phase', m.phase,
        'group_letter', m.group_letter,
        'bracket_slot', m.bracket_slot,
        'status', m.status,
        'home_score', m.home_score,
        'away_score', m.away_score,
        'winner_participant_id', m.winner_participant_id,
        'home', public.participant_brief(m.home_participant_id),
        'away', public.participant_brief(m.away_participant_id),
        'server_now', now()
      ) order by m.phase, m.group_letter, m.bracket_slot), '[]'::jsonb)
      from public.matches m where m.tournament_id = p_tournament
    )
  );
end;
$$;


ALTER FUNCTION "public"."get_bracket"("p_tournament" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_match_penals"("p_match" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  uid uuid := (select auth.uid());
begin
  if uid is null then raise exception 'unauthenticated'; end if;
  if not public.is_match_member(p_match) then raise exception 'not_match_member'; end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'idx', pe.idx,
      'kicker_participant_id', pe.kicker_participant_id,
      'scored', (pe.resolution->>'scored')::boolean,
      'reason', pe.resolution->>'reason'
    ) order by pe.idx)
    from public.penalties pe
    where pe.match_id = p_match and pe.status = 'resolved'
  ), '[]'::jsonb);
end;
$$;


ALTER FUNCTION "public"."get_match_penals"("p_match" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_match_scene"("p_match" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  uid uuid := (select auth.uid());
  v_home uuid; v_away uuid; v_my uuid;
begin
  if uid is null then raise exception 'unauthenticated'; end if;
  if not public.is_match_member(p_match) then raise exception 'not_match_member'; end if;

  select home_participant_id, away_participant_id into v_home, v_away
    from public.matches where id = p_match;
  if v_home is null then raise exception 'match_not_found'; end if;

  select id into v_my from public.participants
    where id in (v_home, v_away) and user_id = uid limit 1;

  return jsonb_build_object(
    'match_id', p_match,
    'my_participant_id', v_my,
    'home', public.participant_brief(v_home),
    'away', public.participant_brief(v_away),
    'home_avatar', (select pr.avatar from public.profiles pr
                    join public.participants pa on pa.user_id = pr.id where pa.id = v_home),
    'away_avatar', (select pr.avatar from public.profiles pr
                    join public.participants pa on pa.user_id = pr.id where pa.id = v_away)
  );
end;
$$;


ALTER FUNCTION "public"."get_match_scene"("p_match" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_tournament_history"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  uid uuid := (select auth.uid());
  v_result jsonb;
begin
  if uid is null then return '[]'::jsonb; end if;

  select coalesce(jsonb_agg(entry order by played_at desc), '[]'::jsonb)
    into v_result
  from (
    select
      jsonb_build_object(
        'tournamentId', p.tournament_id,
        'nationName', coalesce(n.name, '—'),
        'placement', p.placement,
        'eliminatedPhase', p.eliminated_phase,
        'abandoned', p.abandoned,
        'goalsFor', coalesce(agg.goals_for, 0),
        'matchesPlayed', coalesce(agg.played, 0),
        'matchesWon', coalesce(agg.won, 0),
        'playedAt', t.created_at
      ) as entry,
      t.created_at as played_at
    from public.participants p
      join public.tournaments t on t.id = p.tournament_id
      left join public.nations n on n.id = p.nation_id
      left join lateral (
        select
          count(*) as played,
          count(*) filter (where m.winner_participant_id = p.id) as won,
          coalesce(sum(
            case when m.home_participant_id = p.id then m.home_score else m.away_score end
          ), 0) as goals_for
        from public.matches m
        where m.status = 'finished'
          and (m.home_participant_id = p.id or m.away_participant_id = p.id)
      ) agg on true
    where p.user_id = uid   -- los bots puros tienen user_id null → solo trae participaciones humanas
  ) sub;

  return v_result;
end;
$$;


ALTER FUNCTION "public"."get_tournament_history"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  insert into public.profiles (id, username, avatar)
  values (
    new.id,
    new.raw_user_meta_data ->> 'username',
    coalesce(new.raw_user_meta_data -> 'avatar', '{}'::jsonb)
  );
  return new;
end;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_match_member"("p_match" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select exists (
    select 1
    from public.matches m
    join public.participants p on p.id in (m.home_participant_id, m.away_participant_id)
    where m.id = p_match and p.user_id = (select auth.uid())
  );
$$;


ALTER FUNCTION "public"."is_match_member"("p_match" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_room_member"("p_room" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select exists (
    select 1 from public.participants p
    join public.tournaments t on t.id = p.tournament_id
    where t.room_id = p_room and p.user_id = (select auth.uid())
  );
$$;


ALTER FUNCTION "public"."is_room_member"("p_room" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_tournament_member"("p_tournament" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select exists (
    select 1 from public.participants
    where tournament_id = p_tournament and user_id = (select auth.uid())
  );
$$;


ALTER FUNCTION "public"."is_tournament_member"("p_tournament" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."join_room"("p_code" "text") RETURNS TABLE("room_id" "uuid", "tournament_id" "uuid", "code" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  uid uuid := (select auth.uid());
  v_room uuid;
  v_tournament uuid;
  v_status public.room_status;
  v_starts_at timestamptz;
  v_count int;
begin
  if uid is null then raise exception 'unauthenticated'; end if;

  select r.id, t.id, r.status, r.starts_at
    into v_room, v_tournament, v_status, v_starts_at
    from public.rooms r
    join public.tournaments t on t.room_id = r.id
    where r.code = upper(trim(p_code));

  if v_room is null then raise exception 'room_not_found'; end if;
  if v_status = 'cancelled' then raise exception 'room_cancelled'; end if;
  if v_status <> 'lobby' then raise exception 'already_started'; end if;

  -- Ya está dentro → idempotente (un miembro puede recargar aunque cierre la ventana).
  if exists (
    select 1 from public.participants pj
    where pj.tournament_id = v_tournament and pj.user_id = uid
  ) then
    return query select v_room, v_tournament, upper(trim(p_code));
    return;
  end if;

  -- Solo se entra dentro de los 2 minutos.
  if v_starts_at <= now() then raise exception 'room_closed'; end if;

  select count(*) into v_count
    from public.participants pp where pp.tournament_id = v_tournament;
  if v_count >= 48 then raise exception 'room_full'; end if;

  insert into public.participants (tournament_id, user_id, is_bot)
    values (v_tournament, uid, false);

  -- Al completar 48, arranca ya (sin esperar el countdown).
  if v_count + 1 >= 48 then
    perform public.start_tournament(v_room);
  end if;

  return query select v_room, v_tournament, upper(trim(p_code));
end;
$$;


ALTER FUNCTION "public"."join_room"("p_code" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."leave_room"("p_code" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  uid uuid := (select auth.uid());
  v_room uuid;
  v_tournament uuid;
  v_status public.room_status;
  v_humans int;
begin
  if uid is null then raise exception 'unauthenticated'; end if;

  select r.id, t.id, r.status into v_room, v_tournament, v_status
    from public.rooms r
    join public.tournaments t on t.room_id = r.id
    where r.code = upper(trim(p_code));

  if v_room is null then return; end if;        -- nada que hacer → idempotente
  if v_status <> 'lobby' then return; end if;   -- in_progress = Abandonar (F5), no se sale así

  delete from public.participants
    where tournament_id = v_tournament and user_id = uid and is_bot = false;

  select count(*) into v_humans
    from public.participants
    where tournament_id = v_tournament and is_bot = false;

  if v_humans = 0 then
    update public.rooms set status = 'cancelled' where id = v_room and status = 'lobby';
  end if;
end;
$$;


ALTER FUNCTION "public"."leave_room"("p_code" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."materialize_bot_intents"("p_penalty" "uuid", "p_force" boolean DEFAULT false) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare v_status public.penalty_status; v_phase public.answer_phase;
begin
  select status into v_status from public.penalties where id = p_penalty;
  if v_status is null then return; end if;
  v_phase := case v_status when 'second_chance' then 'second_chance' else 'first' end;

  insert into public.penalty_answers
      (penalty_id, participant_id, option_index, selected_at, is_correct, is_random, phase)
  select bi.penalty_id, bi.participant_id, bi.chosen_option, bi.scheduled_answer_at,
         (bi.chosen_option = q.correct_index), false, bi.phase
  from public.bot_intents bi
  join public.penalties pe on pe.id = bi.penalty_id
  join public.questions q on q.id = pe.question_id
  where bi.penalty_id = p_penalty and bi.phase = v_phase and not bi.materialized
    and (p_force or bi.scheduled_answer_at <= now())
  on conflict (penalty_id, participant_id, phase) do nothing;

  update public.bot_intents
    set materialized = true
    where penalty_id = p_penalty and phase = v_phase and not materialized
      and (p_force or scheduled_answer_at <= now());
end;
$$;


ALTER FUNCTION "public"."materialize_bot_intents"("p_penalty" "uuid", "p_force" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."open_next_round"("p_tournament" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare uid uuid := (select auth.uid()); v_rd timestamptz;
begin
  if uid is not null and not public.is_tournament_member(p_tournament) then
    raise exception 'not_participant';
  end if;

  perform pg_advisory_xact_lock(public.engine_hash32('tanda_round:' || p_tournament::text));

  select round_deadline into v_rd from public.tournaments
    where id = p_tournament and status = 'in_progress';
  if v_rd is null then return; end if;       -- no hay tiempo muerto en curso
  if now() < v_rd then return; end if;       -- el tiempo muerto no terminó

  if exists (
    select 1 from public.penalties pe join public.matches m on m.id = pe.match_id
    where m.tournament_id = p_tournament and not m.is_bot_only
      and pe.status in ('open', 'second_chance')
  ) then
    return;  -- defensivo: ya hay ronda abierta
  end if;

  -- Si quedan matches humanos en curso → abrir su próximo penal (dentro de la jornada). Si no,
  -- saltear (la frontera de jornada la cruza advance_tournament, que SÍ simula los bot-only nuevos).
  if exists (
    select 1 from public.matches m
    where m.tournament_id = p_tournament and not m.is_bot_only
      and m.status in ('in_progress', 'sudden_death')
  ) then
    perform public.open_round_penals(p_tournament);
  end if;

  -- Si no quedó ningún penal humano abierto (cruce de jornada/fase o todos terminaron) → avanzar.
  if not exists (
    select 1 from public.penalties pe join public.matches m on m.id = pe.match_id
    where m.tournament_id = p_tournament and not m.is_bot_only
      and pe.status in ('open', 'second_chance')
  ) then
    perform public.advance_tournament(p_tournament);
  end if;

  update public.tournaments set round_deadline = null where id = p_tournament;
end;
$$;


ALTER FUNCTION "public"."open_next_round"("p_tournament" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."open_penalty"("p_penalty" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare uid uuid := (select auth.uid()); v_match uuid;
begin
  if uid is null then raise exception 'unauthenticated'; end if;
  select match_id into v_match from public.penalties where id = p_penalty;
  if v_match is null then raise exception 'penalty_not_found'; end if;
  if not public.is_match_member(v_match) then raise exception 'not_participant'; end if;
  perform public.open_penalty_internal(p_penalty);
end;
$$;


ALTER FUNCTION "public"."open_penalty"("p_penalty" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."open_penalty_internal"("p_penalty" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_match uuid; v_idx int; v_difficulty public.difficulty;
  v_started timestamptz; v_deadline timestamptz; v_prompt text; v_options jsonb;
  v_kicker uuid; v_keeper uuid;
begin
  update public.penalties
    set status = 'open', started_at = now(), deadline = now() + interval '10 seconds'
    where id = p_penalty and status = 'pending'
    returning match_id, idx, difficulty, started_at, deadline,
              kicker_participant_id, keeper_participant_id
    into v_match, v_idx, v_difficulty, v_started, v_deadline, v_kicker, v_keeper;
  if v_started is null then return; end if;  -- no estaba pending → no-op

  select q.prompt, q.options into v_prompt, v_options
    from public.questions q join public.penalties pe on pe.question_id = q.id
    where pe.id = p_penalty;

  perform realtime.send(
    jsonb_build_object(
      'penalty_id', p_penalty, 'match_id', v_match, 'idx', v_idx,
      'prompt', v_prompt, 'options', v_options, 'difficulty', v_difficulty,
      'started_at', v_started, 'deadline', v_deadline, 'server_now', now(),
      'kicker_participant_id', v_kicker, 'keeper_participant_id', v_keeper
    ),
    'penal:start', 'match:' || v_match::text, true
  );
  perform public.precompute_bot_intents(p_penalty);
end;
$$;


ALTER FUNCTION "public"."open_penalty_internal"("p_penalty" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."open_round"("p_tournament" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare v_phase public.tournament_phase; v_slot int; r record;
begin
  select current_phase into v_phase from public.tournaments
    where id = p_tournament and status = 'in_progress';
  if v_phase is null then return; end if;

  if v_phase = 'groups' then
    select min(bracket_slot) into v_slot from public.matches
      where tournament_id = p_tournament and phase = 'group' and status = 'pending';
    if v_slot is not null then
      for r in
        select id from public.matches
        where tournament_id = p_tournament and phase = 'group'
          and bracket_slot = v_slot and status = 'pending' and is_bot_only
      loop
        perform public.simulate_bot_match(r.id);
      end loop;
    end if;
  else
    for r in
      select id from public.matches
      where tournament_id = p_tournament and status = 'pending' and is_bot_only
        and (phase::text = v_phase::text or (v_phase = 'final' and phase = 'third_place'))
    loop
      perform public.simulate_bot_match(r.id);
    end loop;
  end if;

  perform public.open_round_penals(p_tournament);
end;
$$;


ALTER FUNCTION "public"."open_round"("p_tournament" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."open_round_penals"("p_tournament" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare v_phase public.tournament_phase; v_slot int; r record;
begin
  select current_phase into v_phase from public.tournaments
    where id = p_tournament and status = 'in_progress';
  if v_phase is null then return; end if;

  if v_phase = 'groups' then
    select min(bracket_slot) into v_slot from public.matches
      where tournament_id = p_tournament and phase = 'group' and status <> 'finished';
    if v_slot is null then return; end if;
    for r in
      select m.id from public.matches m
      where m.tournament_id = p_tournament and m.phase = 'group' and m.bracket_slot = v_slot
        and not m.is_bot_only and m.status in ('pending', 'in_progress', 'sudden_death')
        and not exists (select 1 from public.penalties pe
                        where pe.match_id = m.id and pe.status in ('open', 'second_chance'))
    loop
      perform public.progress_match(r.id);
      perform public.emit_score_live(r.id);
    end loop;
  else
    for r in
      select m.id from public.matches m
      where m.tournament_id = p_tournament
        and (m.phase::text = v_phase::text or (v_phase = 'final' and m.phase = 'third_place'))
        and not m.is_bot_only and m.status in ('pending', 'in_progress', 'sudden_death')
        and not exists (select 1 from public.penalties pe
                        where pe.match_id = m.id and pe.status in ('open', 'second_chance'))
    loop
      perform public.progress_match(r.id);
      perform public.emit_score_live(r.id);
    end loop;
  end if;
end;
$$;


ALTER FUNCTION "public"."open_round_penals"("p_tournament" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."participant_brief"("p_part" "uuid") RETURNS "jsonb"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select jsonb_build_object(
    'participant_id', p.id,
    'user_id', p.user_id,
    'is_bot', p.is_bot,
    'nation_id', p.nation_id,
    'nation_code', n.code,
    'nation_name', n.name,
    'flag', n.flag_asset,
    'kit_primary', n.kit_primary,
    'accent', n.accent_color
  )
  from public.participants p
  left join public.nations n on n.id = p.nation_id
  where p.id = p_part;
$$;


ALTER FUNCTION "public"."participant_brief"("p_part" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."precompute_bot_intents"("p_penalty" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  mask constant bigint := 4294967295;
  wrong_salt constant bigint := 2246822507;  -- 0x85ebca6b
  v_match uuid; v_idx int; v_status public.penalty_status;
  v_started timestamptz; v_deadline timestamptz; v_question uuid;
  v_kicker uuid; v_keeper uuid; v_removed int; v_correct int;
  v_t_seed bigint; v_seed bigint; v_phase public.answer_phase;
  v_part uuid; v_is_bot boolean; v_tier public.difficulty_tier; v_seedp bigint;
  v_wc boolean; v_delay int; v_chosen int; v_sched timestamptz; v_wrong int[];
begin
  select match_id, idx, status, started_at, deadline, question_id,
         kicker_participant_id, keeper_participant_id, removed_option
    into v_match, v_idx, v_status, v_started, v_deadline, v_question,
         v_kicker, v_keeper, v_removed
    from public.penalties where id = p_penalty;
  if v_match is null or v_status not in ('open', 'second_chance') then return; end if;
  v_phase := case v_status when 'second_chance' then 'second_chance' else 'first' end;

  select t.seed into v_t_seed
    from public.matches m join public.tournaments t on t.id = m.tournament_id
    where m.id = v_match;
  v_seed := (coalesce(v_t_seed, 0) # public.engine_hash32(v_match::text || ':' || v_idx)) & mask;
  select correct_index into v_correct from public.questions where id = v_question;

  foreach v_part in array array[v_kicker, v_keeper] loop
    select p.is_bot, n.difficulty_tier into v_is_bot, v_tier
      from public.participants p
      left join public.nations n on n.id = p.nation_id
      where p.id = v_part;
    if not coalesce(v_is_bot, false) then continue; end if;
    v_tier := coalesce(v_tier, 'medium');  -- bot sin nación (dev harness) → tier medio

    -- Seed por (penal, participante, fase): reproducible y distinto en segunda chance.
    v_seedp := (v_seed # public.engine_hash32(v_part::text || ':' || v_phase::text)) & mask;
    select will_be_correct, delay_ms into v_wc, v_delay
      from public.engine_bot_intent(v_tier, v_seedp);

    if v_wc then
      v_chosen := v_correct;
    else
      -- Opción incorrecta (en segunda chance excluye la quitada → queda 1 sola).
      select array_agg(i order by i) into v_wrong from generate_series(0, 2) i
        where i <> v_correct and (v_removed is null or i <> v_removed);
      v_chosen := v_wrong[public.engine_rand_int((v_seedp # wrong_salt) & mask, array_length(v_wrong, 1)) + 1];
    end if;

    -- Responde a los delay_ms; nunca después del deadline de la ventana.
    v_sched := least(v_started + (v_delay::text || ' milliseconds')::interval, v_deadline);

    insert into public.bot_intents
        (penalty_id, participant_id, phase, scheduled_answer_at, will_be_correct, chosen_option, materialized)
      values (p_penalty, v_part, v_phase, v_sched, v_wc, v_chosen, false)
      on conflict (penalty_id, participant_id, phase) do nothing;
  end loop;
end;
$$;


ALTER FUNCTION "public"."precompute_bot_intents"("p_penalty" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."progress_match"("p_match" "uuid") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_phase public.match_phase; v_kind text; v_home uuid; v_away uuid; v_status public.match_status;
  v_scored boolean[]; st record; v_idx int; v_kicker uuid; v_keeper uuid;
  v_q uuid; v_diff public.difficulty; v_pen uuid;
begin
  select phase, home_participant_id, away_participant_id, status
    into v_phase, v_home, v_away, v_status
    from public.matches where id = p_match;
  if v_home is null or v_away is null then raise exception 'match_incomplete'; end if;
  if v_status = 'finished' then return 'finished'; end if;
  v_kind := case when v_phase = 'group' then 'group' else 'elimination' end;

  select coalesce(array_agg((resolution->>'scored')::boolean order by idx), '{}')
    into v_scored
    from public.penalties where match_id = p_match and status = 'resolved';

  select * into st from public.engine_advance_match(v_kind, v_scored);

  if st.status = 'finished' then
    update public.matches
      set status = 'finished',
          winner_participant_id = case st.winner when 'home' then v_home when 'away' then v_away else null end
      where id = p_match;
    return 'finished';
  end if;

  v_idx := st.next_index;
  if st.next_kicker = 'home' then v_kicker := v_home; v_keeper := v_away;
  else v_kicker := v_away; v_keeper := v_home; end if;

  select id into v_pen from public.penalties where match_id = p_match and idx = v_idx;
  if v_pen is null then
    v_q := public.assign_round_question(p_match, v_idx);
    v_diff := public.tanda_penalty_difficulty(v_phase, v_idx);
    insert into public.penalties
        (match_id, idx, kicker_participant_id, keeper_participant_id, question_id, difficulty, status)
      values (p_match, v_idx, v_kicker, v_keeper, v_q, v_diff, 'pending')
      returning id into v_pen;
  end if;

  update public.matches
    set status = case when st.status = 'sudden_death' then 'sudden_death'::public.match_status
                      else 'in_progress'::public.match_status end
    where id = p_match and status <> 'finished';

  perform public.open_penalty_internal(v_pen);
  return st.status;
end;
$$;


ALTER FUNCTION "public"."progress_match"("p_match" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."quick_play"() RETURNS TABLE("room_id" "uuid", "tournament_id" "uuid", "code" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  uid uuid := (select auth.uid());
  v_room uuid;
  v_tournament uuid;
  v_code text;
begin
  if uid is null then raise exception 'unauthenticated'; end if;
  perform public.enforce_rate_limit('quick_play', 20, interval '1 minute');
  perform pg_advisory_xact_lock(hashtext('tanda_quick_play'));

  -- 1) Reanudar: torneo en curso, o un lobby propio AÚN ABIERTO (no uno vencido).
  select r.id, t.id, r.code into v_room, v_tournament, v_code
    from public.participants p
    join public.tournaments t on t.id = p.tournament_id
    join public.rooms r on r.id = t.room_id
    where p.user_id = uid and p.is_bot = false
      and (r.status = 'in_progress'
           or (r.status = 'lobby' and r.starts_at > now()))
    order by r.created_at desc
    limit 1;
  if v_room is not null then
    return query select v_room, v_tournament, v_code;
    return;
  end if;

  -- 2) Lobby ABIERTO (dentro de los 2 min) con más humanos y cupo.
  select r.id, t.id, r.code into v_room, v_tournament, v_code
    from public.rooms r
    join public.tournaments t on t.room_id = r.id
    where r.status = 'lobby'
      and r.starts_at > now()
      and (select count(*) from public.participants pp where pp.tournament_id = t.id) < 48
    order by
      (select count(*) from public.participants pp
        where pp.tournament_id = t.id and pp.is_bot = false) desc,
      r.created_at asc
    limit 1;
  if v_room is not null then
    -- idempotente: no duplicar si ya soy parte de esa sala.
    if not exists (
      select 1 from public.participants pq
      where pq.tournament_id = v_tournament and pq.user_id = uid
    ) then
      insert into public.participants (tournament_id, user_id, is_bot)
        values (v_tournament, uid, false);
    end if;
    return query select v_room, v_tournament, v_code;
    return;
  end if;

  -- 3) No hay ninguna abierta → crear.
  return query select * from public.create_room();
end;
$$;


ALTER FUNCTION "public"."quick_play"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."realtime_match_member"("p_topic" "text") RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare v_match uuid;
begin
  if p_topic is null or p_topic not like 'match:%' then return false; end if;
  begin
    v_match := substring(p_topic from 7)::uuid;
  exception when others then
    return false;
  end;
  return public.is_match_member(v_match);
end;
$$;


ALTER FUNCTION "public"."realtime_match_member"("p_topic" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."realtime_tournament_member"("p_topic" "text") RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare v_t uuid;
begin
  if p_topic is null or p_topic not like 'tournament:%' then return false; end if;
  begin
    v_t := substring(p_topic from 12)::uuid;
  exception when others then
    return false;
  end;
  return public.is_tournament_member(v_t);
end;
$$;


ALTER FUNCTION "public"."realtime_tournament_member"("p_topic" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."resolve_penalty"("p_penalty" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  uid uuid := (select auth.uid());
  v_match uuid; v_idx int; v_status public.penalty_status;
  v_deadline timestamptz; v_question uuid; v_kicker uuid; v_keeper uuid;
  v_tournament uuid; v_t_seed bigint; v_seed bigint;
  v_correct int; v_prompt text; v_options jsonb; v_explanation text;
  v_phase public.answer_phase;
  v_home uuid; v_away uuid; v_home_score int; v_away_score int;
  v_k_ans record; v_g_ans record;
  v_k_ok boolean; v_g_ok boolean;
  v_winner text; v_reason text; v_scored boolean; v_variant int;
  v_removed int; v_wrong int[]; v_kw int; v_gw int;
  v_part uuid; v_new_deadline timestamptz;
  v_won_by_speed boolean := false;  -- 10.7: ganó por ser más rápido (ambos acertaron)
begin
  select match_id, idx, status, deadline, question_id, kicker_participant_id, keeper_participant_id
    into v_match, v_idx, v_status, v_deadline, v_question, v_kicker, v_keeper
    from public.penalties
    where id = p_penalty and status in ('open', 'second_chance')
    for update skip locked;
  if v_match is null then return; end if;

  if uid is not null and not public.is_match_member(v_match) then
    raise exception 'not_participant';
  end if;

  if now() < v_deadline then raise exception 'too_early'; end if;

  v_phase := case v_status when 'open' then 'first' else 'second_chance' end;

  select t.id, t.seed into v_tournament, v_t_seed
    from public.matches m join public.tournaments t on t.id = m.tournament_id
    where m.id = v_match;
  v_seed := (coalesce(v_t_seed, 0) # public.engine_hash32(v_match::text || ':' || v_idx)) & 4294967295;

  select q.correct_index, q.prompt, q.options, q.explanation
    into v_correct, v_prompt, v_options, v_explanation
    from public.questions q where q.id = v_question;

  perform public.materialize_bot_intents(p_penalty, true);

  foreach v_part in array array[v_kicker, v_keeper] loop
    if not exists (
      select 1 from public.penalty_answers
      where penalty_id = p_penalty and participant_id = v_part and phase = v_phase
    ) then
      insert into public.penalty_answers
        (penalty_id, participant_id, option_index, selected_at, is_correct, is_random, phase)
      values (
        p_penalty, v_part,
        public.engine_rand_int(v_seed # public.engine_hash32(v_part::text), 3),
        now(), null, true, v_phase
      );
      update public.penalty_answers
        set is_correct = (option_index = v_correct)
        where penalty_id = p_penalty and participant_id = v_part and phase = v_phase;
    end if;
  end loop;

  select option_index, selected_at, is_correct into v_k_ans
    from public.penalty_answers
    where penalty_id = p_penalty and participant_id = v_kicker and phase = v_phase;
  select option_index, selected_at, is_correct into v_g_ans
    from public.penalty_answers
    where penalty_id = p_penalty and participant_id = v_keeper and phase = v_phase;

  v_k_ok := coalesce(v_k_ans.is_correct, false);
  v_g_ok := coalesce(v_g_ans.is_correct, false);

  if v_k_ok and v_g_ok then
    if v_k_ans.selected_at < v_g_ans.selected_at then
      v_winner := 'kicker'; v_reason := 'goal'; v_won_by_speed := true;
    elsif v_g_ans.selected_at < v_k_ans.selected_at then
      v_winner := 'keeper'; v_reason := 'save'; v_won_by_speed := true;
    elsif public.engine_rand_bool(v_seed) then
      v_winner := 'kicker'; v_reason := 'goal';
    else
      v_winner := 'keeper'; v_reason := 'save';
    end if;
  elsif v_k_ok then
    v_winner := 'kicker'; v_reason := 'goal';
  elsif v_g_ok then
    v_winner := 'keeper'; v_reason := 'miss_wide';
  else
    v_winner := null;
  end if;

  if v_winner is null and v_phase = 'first' then
    select array_agg(i order by i) into v_wrong
      from generate_series(0, 2) i where i <> v_correct;
    v_kw := case when v_k_ans.option_index <> v_correct then v_k_ans.option_index end;
    v_gw := case when v_g_ans.option_index <> v_correct then v_g_ans.option_index end;
    if v_kw is not null and v_kw = v_gw then
      v_removed := v_kw;
    else
      v_removed := v_wrong[public.engine_rand_int(v_seed, 2) + 1];
    end if;

    v_new_deadline := now() + interval '5 seconds';
    update public.penalties
      set status = 'second_chance', second_chance = true, removed_option = v_removed,
          started_at = now(), deadline = v_new_deadline
      where id = p_penalty;

    perform realtime.send(
      jsonb_build_object(
        'penalty_id', p_penalty, 'match_id', v_match, 'idx', v_idx,
        'prompt', v_prompt, 'options', v_options, 'removed_option', v_removed,
        'phase', 'second_chance', 'reason', 'both_missed',  -- 10.13
        'started_at', now(), 'deadline', v_new_deadline,
        'server_now', now()
      ),
      'penal:second_chance', 'match:' || v_match::text, true
    );

    perform public.precompute_bot_intents(p_penalty);
    return;
  end if;

  if v_winner is null then
    v_winner := 'keeper'; v_reason := 'miss_wide';
  end if;
  v_scored := (v_winner = 'kicker');
  v_variant := public.engine_rand_int((v_seed # 1597334677) & 4294967295, 4);

  update public.penalties
    set status = 'resolved',
        resolution = jsonb_build_object(
          'winner', v_winner, 'scored', v_scored, 'reason', v_reason,
          'variant', v_variant, 'phase', v_phase
        )
    where id = p_penalty;

  select home_participant_id, away_participant_id into v_home, v_away
    from public.matches where id = v_match;
  if v_scored then
    if v_kicker = v_home then
      update public.matches set home_score = home_score + 1 where id = v_match;
    else
      update public.matches set away_score = away_score + 1 where id = v_match;
    end if;
  end if;
  select home_score, away_score into v_home_score, v_away_score
    from public.matches where id = v_match;

  perform realtime.send(
    jsonb_build_object(
      'penalty_id', p_penalty, 'match_id', v_match, 'idx', v_idx,
      'outcome', 'resolved', 'winner', v_winner, 'scored', v_scored,
      'reason', v_reason, 'variant', v_variant, 'phase', v_phase,
      'correct_index', v_correct, 'explanation', v_explanation,
      'home_score', v_home_score, 'away_score', v_away_score,
      -- 10.7/10.11: detalle de tiempos (ya resuelto → no es info sensible)
      'won_by_speed', v_won_by_speed,
      'kicker_participant_id', v_kicker, 'keeper_participant_id', v_keeper,
      'kicker_selected_at', v_k_ans.selected_at, 'keeper_selected_at', v_g_ans.selected_at
    ),
    'penal:result', 'match:' || v_match::text, true
  );

  -- 4.6: NO encadenar el próximo penal del match. Finalizar si quedó decidido y dejar que el
  -- barrier de ronda (resolve_round) coordine la apertura conjunta de la próxima ronda.
  perform public.finalize_match(v_match);
  perform public.emit_score_live(v_match);
  perform public.resolve_round(v_tournament);
end;
$$;


ALTER FUNCTION "public"."resolve_penalty"("p_penalty" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."resolve_round"("p_tournament" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  if exists (
    select 1 from public.penalties pe join public.matches m on m.id = pe.match_id
    where m.tournament_id = p_tournament and not m.is_bot_only
      and pe.status in ('open', 'second_chance')
  ) then
    return;  -- ronda en juego: faltan penales (o 2ª chances) por cerrar
  end if;

  if exists (
    select 1 from public.matches m
    where m.tournament_id = p_tournament and not m.is_bot_only
      and m.status in ('in_progress', 'sudden_death')
  ) then
    -- DENTRO del match: próximo penal del mismo match (10.2) → tiempo muerto corto
    update public.tournaments set round_deadline = now() + interval '3 seconds'
      where id = p_tournament and status = 'in_progress';
  else
    -- ENTRE matches: la jornada/fase terminó para los humanos → tiempo muerto largo para ver el
    -- bracket/tabla del grupo (10.3). NO avanzamos acá; open_next_round lo hace al vencer el deadline.
    update public.tournaments set round_deadline = now() + interval '6 seconds'
      where id = p_tournament and status = 'in_progress';
  end if;
end;
$$;


ALTER FUNCTION "public"."resolve_round"("p_tournament" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rls_auto_enable"() RETURNS "event_trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog'
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."rls_auto_enable"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."select_option"("p_penalty" "uuid", "p_option" integer) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  uid uuid := (select auth.uid());
  v_match uuid;
  v_status public.penalty_status;
  v_started timestamptz;
  v_deadline timestamptz;
  v_removed int;
  v_participant uuid;
  v_phase public.answer_phase;
  v_correct int;
  v_is_correct boolean;
  v_existing int;
begin
  if uid is null then raise exception 'unauthenticated'; end if;

  select match_id, status, started_at, deadline, removed_option
    into v_match, v_status, v_started, v_deadline, v_removed
    from public.penalties where id = p_penalty;
  if v_match is null then raise exception 'penalty_not_found'; end if;

  -- El caller debe ser participante (humano) del match — kicker o keeper, da igual.
  select p.id into v_participant
    from public.matches m
    join public.participants p on p.id in (m.home_participant_id, m.away_participant_id)
    where m.id = v_match and p.user_id = uid;
  if v_participant is null then raise exception 'not_participant'; end if;

  -- Fase según estado del penal. Solo `open`/`second_chance` aceptan selección.
  if v_status = 'open' then
    v_phase := 'first';
  elsif v_status = 'second_chance' then
    v_phase := 'second_chance';
  else
    raise exception 'penalty_closed';
  end if;

  -- Ventana de tiempo: la valida el SERVER contra su `deadline` (anti-trampa, SPEC §1.3/§7).
  if v_started is null or now() < v_started or now() >= v_deadline then
    raise exception 'out_of_window';
  end if;

  -- Opción válida (0-2) y, en segunda chance, distinta de la quitada.
  if p_option < 0 or p_option > 2 then raise exception 'invalid_option'; end if;
  if v_phase = 'second_chance' and p_option = v_removed then
    raise exception 'invalid_option';
  end if;

  -- Corrección server-only: la pregunta entra acá por SECURITY DEFINER (policy deny-all).
  select q.correct_index into v_correct
    from public.questions q
    join public.penalties pe on pe.question_id = q.id
    where pe.id = p_penalty;
  v_is_correct := (p_option = v_correct);

  -- 10.11: PRIMER TAP GANA. La respuesta deja de ser cambiable. El insert con `do nothing` es el guard
  -- autoritativo (race-safe entre llamadas concurrentes). Si no insertó, ya había una selección: si es
  -- la MISMA opción es idempotente (doble-emisión por la red → ok); si difiere, se rechaza el cambio.
  insert into public.penalty_answers
      (penalty_id, participant_id, option_index, selected_at, is_correct, is_random, phase)
    values (p_penalty, v_participant, p_option, now(), v_is_correct, false, v_phase)
  on conflict (penalty_id, participant_id, phase) do nothing;

  if not found then
    select option_index into v_existing
      from public.penalty_answers
      where penalty_id = p_penalty and participant_id = v_participant and phase = v_phase;
    if v_existing is distinct from p_option then
      raise exception 'already_answered';
    end if;
  end if;
end;
$$;


ALTER FUNCTION "public"."select_option"("p_penalty" "uuid", "p_option" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."set_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."simulate_bot_match"("p_match" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  mask constant bigint := 4294967295;
  v_status public.match_status; v_phase public.match_phase; v_bot_only boolean;
  v_home uuid; v_away uuid; v_t_seed bigint; v_kind text;
  v_home_tier public.difficulty_tier; v_away_tier public.difficulty_tier;
  v_scored boolean[] := '{}'; st record; i int;
  v_kicker uuid; v_keeper uuid; k_tier public.difficulty_tier; g_tier public.difficulty_tier;
  v_seedp bigint; sc boolean;
begin
  select m.status, m.phase, m.is_bot_only, m.home_participant_id, m.away_participant_id, t.seed
    into v_status, v_phase, v_bot_only, v_home, v_away, v_t_seed
    from public.matches m join public.tournaments t on t.id = m.tournament_id
    where m.id = p_match;
  if v_home is null then raise exception 'match_not_found'; end if;
  if not v_bot_only then raise exception 'not_bot_only'; end if;
  if v_status = 'finished' then return; end if;            -- idempotente
  if v_home is null or v_away is null then raise exception 'match_incomplete'; end if;

  v_kind := case when v_phase = 'group' then 'group' else 'elimination' end;
  select coalesce(difficulty_tier, 'medium') into v_home_tier
    from public.participants p left join public.nations n on n.id = p.nation_id where p.id = v_home;
  select coalesce(difficulty_tier, 'medium') into v_away_tier
    from public.participants p left join public.nations n on n.id = p.nation_id where p.id = v_away;

  loop
    select * into st from public.engine_advance_match(v_kind, v_scored);
    exit when st.status = 'finished';
    i := st.next_index;
    if st.next_kicker = 'home' then
      v_kicker := v_home; v_keeper := v_away; k_tier := v_home_tier; g_tier := v_away_tier;
    else
      v_kicker := v_away; v_keeper := v_home; k_tier := v_away_tier; g_tier := v_home_tier;
    end if;
    v_seedp := (coalesce(v_t_seed, 0) # public.engine_hash32(p_match::text || ':' || i)) & mask;
    sc := public.bot_penalty_scored(v_seedp, k_tier, g_tier, v_kicker, v_keeper);
    v_scored := array_append(v_scored, sc);
    exit when array_length(v_scored, 1) > 60;  -- tope de seguridad (muerte súbita interminable)
  end loop;

  update public.matches
    set home_score = st.home, away_score = st.away, status = 'finished',
        winner_participant_id = case st.winner
          when 'home' then v_home when 'away' then v_away else null end
    where id = p_match;

  perform public.emit_score_live(p_match);  -- 6.5: marcador final del partido bot-only
end;
$$;


ALTER FUNCTION "public"."simulate_bot_match"("p_match" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."start_tournament"("p_room" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_letters constant text[] := array['A','B','C','D','E','F','G','H','I','J','K','L'];
  v_tournament uuid;
  v_seed bigint;
  v_humans int;
begin
  select t.id, t.seed into v_tournament, v_seed
    from public.tournaments t
    where t.room_id = p_room and t.status = 'pending'
    for update skip locked;
  if v_tournament is null then return; end if;

  select count(*) into v_humans
    from public.participants where tournament_id = v_tournament and is_bot = false;

  if v_humans = 0 then
    update public.rooms set status = 'cancelled' where id = p_room;
    return;
  end if;

  update public.rooms set status = 'starting' where id = p_room;

  with h as (
    select id, row_number() over (order by created_at, id) as rn
    from public.participants
    where tournament_id = v_tournament and is_bot = false
  )
  update public.participants p
    set group_letter = v_letters[((h.rn - 1) % 12) + 1]
    from h where p.id = h.id;

  insert into public.participants (tournament_id, user_id, is_bot, group_letter)
  select v_tournament, null, true, g.letter
  from (select unnest(v_letters) as letter) g
  cross join lateral generate_series(
    1,
    4 - (select count(*) from public.participants
         where tournament_id = v_tournament and group_letter = g.letter)
  );

  with parts as (
    select id, row_number() over (order by md5(v_seed::text || ':' || id::text)) as rn
    from public.participants where tournament_id = v_tournament
  ),
  nats as (
    select id as nation_id, row_number() over (order by md5(v_seed::text || ':' || id::text)) as rn
    from public.nations
  )
  update public.participants p
    set nation_id = nats.nation_id
    from parts join nats on nats.rn = parts.rn
    where p.id = parts.id;

  with ps as (
    select id, group_letter, is_bot,
           row_number() over (
             partition by group_letter order by md5(v_seed::text || ':' || id::text)
           ) as rn
    from public.participants where tournament_id = v_tournament
  )
  insert into public.matches
    (tournament_id, phase, group_letter, bracket_slot,
     home_participant_id, away_participant_id, is_bot_only, status)
  select v_tournament, 'group', h.group_letter, pair.md,
         h.id, a.id, (h.is_bot and a.is_bot), 'pending'
  from (values (1,4,1),(2,3,1),(1,3,2),(4,2,2),(1,2,3),(3,4,3)) as pair(hr, ar, md)
  join ps h on h.rn = pair.hr
  join ps a on a.rn = pair.ar and a.group_letter = h.group_letter;

  update public.tournaments set status = 'in_progress', current_phase = 'groups'
    where id = v_tournament;
  update public.rooms set status = 'in_progress' where id = p_room;

  -- 6.4(b): arrancar la 1ª jornada (bot-only al instante, humanos abren su 1er penal).
  perform public.advance_tournament(v_tournament);
end;
$$;


ALTER FUNCTION "public"."start_tournament"("p_room" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."take_tournament_question"("p_tournament" "uuid", "p_difficulty" "public"."difficulty", "p_seed" bigint) RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_question uuid;
  v_order public.difficulty[];
  v_diff public.difficulty;
begin
  -- Orden de búsqueda: la dificultad pedida primero, luego las adyacentes (último recurso).
  v_order := case p_difficulty
    when 'easy'      then array['easy','medium','hard','very_hard']::public.difficulty[]
    when 'medium'    then array['medium','easy','hard','very_hard']::public.difficulty[]
    when 'hard'      then array['hard','very_hard','medium','easy']::public.difficulty[]
    when 'very_hard' then array['very_hard','hard','medium','easy']::public.difficulty[]
  end;

  -- 1) Pregunta no usada por este torneo, recorriendo dificultades por cercanía.
  foreach v_diff in array v_order loop
    select q.id into v_question
    from public.questions q
    where q.difficulty = v_diff
      and not exists (
        select 1 from public.tournament_questions tq
        where tq.tournament_id = p_tournament and tq.question_id = q.id
      )
    order by md5(p_seed::text || ':' || q.id::text)
    limit 1;
    exit when v_question is not null;
  end loop;

  -- 2) Último recurso: el banco entero ya está consumido → permitir repetir (determinista).
  if v_question is null then
    select q.id into v_question
    from public.questions q
    where q.difficulty = p_difficulty
    order by md5(p_seed::text || ':' || q.id::text)
    limit 1;
  end if;

  if v_question is null then
    raise exception 'no_questions_available' using detail = p_difficulty::text;
  end if;

  insert into public.tournament_questions (tournament_id, question_id)
    values (p_tournament, v_question)
    on conflict do nothing;

  return v_question;
end;
$$;


ALTER FUNCTION "public"."take_tournament_question"("p_tournament" "uuid", "p_difficulty" "public"."difficulty", "p_seed" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."tanda_penalty_difficulty"("p_phase" "public"."match_phase", "p_idx" integer) RETURNS "public"."difficulty"
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO ''
    AS $$
  select case
    when p_idx <= 3 then
      case p_phase
        when 'group' then 'easy'::public.difficulty
        when 'round_of_32' then 'medium'::public.difficulty
        when 'round_of_16' then 'medium'::public.difficulty
        when 'quarters' then 'medium'::public.difficulty
        else 'hard'::public.difficulty  -- semis, third_place, final
      end
    else
      case p_phase
        when 'group' then 'medium'::public.difficulty
        when 'round_of_32' then 'hard'::public.difficulty
        when 'round_of_16' then 'hard'::public.difficulty
        when 'quarters' then 'hard'::public.difficulty
        else 'very_hard'::public.difficulty  -- semis, third_place, final
      end
  end;
$$;


ALTER FUNCTION "public"."tanda_penalty_difficulty"("p_phase" "public"."match_phase", "p_idx" integer) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."tanda_penalty_difficulty"("p_phase" "public"."match_phase", "p_idx" integer) IS 'Port SQL de lib/engine/difficulty.ts penaltyDifficulty (§9.3). Verificado por paridad.';



CREATE OR REPLACE FUNCTION "public"."tick"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare r record;
begin
  insert into public.penalty_answers
      (penalty_id, participant_id, option_index, selected_at, is_correct, is_random, phase)
  select bi.penalty_id, bi.participant_id, bi.chosen_option, bi.scheduled_answer_at,
         (bi.chosen_option = q.correct_index), false, bi.phase
  from public.bot_intents bi
  join public.penalties pe on pe.id = bi.penalty_id and pe.status in ('open', 'second_chance')
  join public.questions q on q.id = pe.question_id
  where not bi.materialized and bi.scheduled_answer_at <= now()
  on conflict (penalty_id, participant_id, phase) do nothing;

  update public.bot_intents bi
    set materialized = true
    from public.penalties pe
    where bi.penalty_id = pe.id and pe.status in ('open', 'second_chance')
      and not bi.materialized and bi.scheduled_answer_at <= now();

  for r in
    select id from public.penalties
    where status in ('open', 'second_chance')
      and deadline is not null and deadline <= now()
    order by deadline
    limit 200
  loop
    begin perform public.resolve_penalty(r.id); exception when others then null; end;
  end loop;

  -- Tiempo muerto entre rondas vencido → abrir la próxima ronda (backstop del poke del cliente).
  for r in
    select id from public.tournaments
    where status = 'in_progress' and round_deadline is not null and round_deadline <= now()
    limit 100
  loop
    begin perform public.open_next_round(r.id); exception when others then null; end;
  end loop;

  for r in
    select id from public.rooms where status = 'lobby' and starts_at <= now() limit 100
  loop
    begin perform public.start_tournament(r.id); exception when others then null; end;
  end loop;

  for r in
    select t.id from public.tournaments t
    where t.status = 'in_progress'
      and t.round_deadline is null
      and not exists (
        select 1 from public.matches m
        where m.tournament_id = t.id and m.status in ('in_progress', 'sudden_death')
      )
    limit 100
  loop
    begin perform public.advance_tournament(r.id); exception when others then null; end;
  end loop;
end;
$$;


ALTER FUNCTION "public"."tick"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."username_available"("check_name" "text") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select not exists (
    select 1 from public.profiles where lower(username) = lower(trim(check_name))
  );
$$;


ALTER FUNCTION "public"."username_available"("check_name" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."username_available"("check_name" "text") IS 'True si el username está libre (case-insensitive). Usado en el registro.';


SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."bot_intents" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "penalty_id" "uuid" NOT NULL,
    "participant_id" "uuid" NOT NULL,
    "phase" "public"."answer_phase" DEFAULT 'first'::"public"."answer_phase" NOT NULL,
    "scheduled_answer_at" timestamp with time zone,
    "will_be_correct" boolean,
    "chosen_option" integer,
    "materialized" boolean DEFAULT false NOT NULL
);


ALTER TABLE "public"."bot_intents" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."matches" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tournament_id" "uuid" NOT NULL,
    "phase" "public"."match_phase" NOT NULL,
    "group_letter" "text",
    "bracket_slot" integer,
    "home_participant_id" "uuid",
    "away_participant_id" "uuid",
    "home_score" integer DEFAULT 0 NOT NULL,
    "away_score" integer DEFAULT 0 NOT NULL,
    "winner_participant_id" "uuid",
    "status" "public"."match_status" DEFAULT 'pending'::"public"."match_status" NOT NULL,
    "is_bot_only" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."matches" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."nations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "code" "text" NOT NULL,
    "name" "text" NOT NULL,
    "fifa_rank" integer,
    "difficulty_tier" "public"."difficulty_tier" NOT NULL,
    "accent_color" "text",
    "flag_asset" "text",
    "kit_primary" "text",
    "kit_secondary" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."nations" OWNER TO "postgres";


COMMENT ON TABLE "public"."nations" IS 'Selecciones (clasificados 2026). Seed en F5.0.';



CREATE TABLE IF NOT EXISTS "public"."participants" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tournament_id" "uuid" NOT NULL,
    "user_id" "uuid",
    "nation_id" "uuid",
    "is_bot" boolean DEFAULT false NOT NULL,
    "group_letter" "text",
    "seed" integer,
    "eliminated_phase" "public"."match_phase",
    "placement" integer,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "abandoned" boolean DEFAULT false NOT NULL
);


ALTER TABLE "public"."participants" OWNER TO "postgres";


COMMENT ON COLUMN "public"."participants"."abandoned" IS 'true = humano que tocó Abandonar (pasó a bot pero conserva user_id). Distingue del bot puro (user_id null).';



CREATE TABLE IF NOT EXISTS "public"."penalties" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "match_id" "uuid" NOT NULL,
    "idx" integer NOT NULL,
    "kicker_participant_id" "uuid" NOT NULL,
    "keeper_participant_id" "uuid" NOT NULL,
    "question_id" "uuid",
    "difficulty" "public"."difficulty" NOT NULL,
    "started_at" timestamp with time zone,
    "deadline" timestamp with time zone,
    "status" "public"."penalty_status" DEFAULT 'pending'::"public"."penalty_status" NOT NULL,
    "second_chance" boolean DEFAULT false NOT NULL,
    "removed_option" integer,
    "resolution" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."penalties" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."penalty_answers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "penalty_id" "uuid" NOT NULL,
    "participant_id" "uuid" NOT NULL,
    "option_index" integer,
    "selected_at" timestamp with time zone,
    "is_correct" boolean,
    "is_random" boolean DEFAULT false NOT NULL,
    "phase" "public"."answer_phase" DEFAULT 'first'::"public"."answer_phase" NOT NULL
);


ALTER TABLE "public"."penalty_answers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "username" "text" NOT NULL,
    "avatar" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "username_format" CHECK (("username" ~ '^[a-zA-Z0-9_]{3,20}$'::"text"))
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


COMMENT ON TABLE "public"."profiles" IS 'Perfil público del usuario. username = nombre en juego.';



CREATE TABLE IF NOT EXISTS "public"."questions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "category" "text" NOT NULL,
    "difficulty" "public"."difficulty" NOT NULL,
    "prompt" "text" NOT NULL,
    "options" "jsonb" NOT NULL,
    "correct_index" integer NOT NULL,
    "explanation" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "source_key" "text",
    CONSTRAINT "correct_index_range" CHECK ((("correct_index" >= 0) AND ("correct_index" <= 2))),
    CONSTRAINT "options_are_three" CHECK ((("jsonb_typeof"("options") = 'array'::"text") AND ("jsonb_array_length"("options") = 3)))
);


ALTER TABLE "public"."questions" OWNER TO "postgres";


COMMENT ON COLUMN "public"."questions"."correct_index" IS 'Server-only: nunca se expone al cliente hasta resolver el penal.';



COMMENT ON COLUMN "public"."questions"."source_key" IS 'Clave estable de seed (idempotencia). Null en preguntas dinámicas/no-seed.';



CREATE TABLE IF NOT EXISTS "public"."rate_limits" (
    "user_id" "uuid" NOT NULL,
    "action" "text" NOT NULL,
    "window_start" timestamp with time zone DEFAULT "now"() NOT NULL,
    "count" integer DEFAULT 0 NOT NULL
);


ALTER TABLE "public"."rate_limits" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."rooms" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "code" "text" NOT NULL,
    "host_id" "uuid",
    "status" "public"."room_status" DEFAULT 'lobby'::"public"."room_status" NOT NULL,
    "starts_at" timestamp with time zone NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."rooms" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tournament_questions" (
    "tournament_id" "uuid" NOT NULL,
    "question_id" "uuid" NOT NULL
);


ALTER TABLE "public"."tournament_questions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tournaments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "room_id" "uuid" NOT NULL,
    "status" "public"."tournament_status" DEFAULT 'in_progress'::"public"."tournament_status" NOT NULL,
    "current_phase" "public"."tournament_phase" DEFAULT 'groups'::"public"."tournament_phase" NOT NULL,
    "seed" bigint NOT NULL,
    "champion_participant_id" "uuid",
    "third_place_participant_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "round_deadline" timestamp with time zone
);


ALTER TABLE "public"."tournaments" OWNER TO "postgres";


COMMENT ON COLUMN "public"."tournaments"."seed" IS 'Gobierna sorteos/bracket/bot_intents → reproducible y testeable.';



COMMENT ON COLUMN "public"."tournaments"."round_deadline" IS 'Fin del tiempo muerto entre rondas de penales (barrier 4.6); null = no hay tiempo muerto en curso.';



ALTER TABLE ONLY "public"."bot_intents"
    ADD CONSTRAINT "bot_intents_penalty_id_participant_id_phase_key" UNIQUE ("penalty_id", "participant_id", "phase");



ALTER TABLE ONLY "public"."bot_intents"
    ADD CONSTRAINT "bot_intents_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."matches"
    ADD CONSTRAINT "matches_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."nations"
    ADD CONSTRAINT "nations_code_key" UNIQUE ("code");



ALTER TABLE ONLY "public"."nations"
    ADD CONSTRAINT "nations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."participants"
    ADD CONSTRAINT "participants_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."penalties"
    ADD CONSTRAINT "penalties_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."penalty_answers"
    ADD CONSTRAINT "penalty_answers_penalty_id_participant_id_phase_key" UNIQUE ("penalty_id", "participant_id", "phase");



ALTER TABLE ONLY "public"."penalty_answers"
    ADD CONSTRAINT "penalty_answers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."questions"
    ADD CONSTRAINT "questions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."questions"
    ADD CONSTRAINT "questions_source_key_key" UNIQUE ("source_key");



ALTER TABLE ONLY "public"."rate_limits"
    ADD CONSTRAINT "rate_limits_pkey" PRIMARY KEY ("user_id", "action");



ALTER TABLE ONLY "public"."rooms"
    ADD CONSTRAINT "rooms_code_key" UNIQUE ("code");



ALTER TABLE ONLY "public"."rooms"
    ADD CONSTRAINT "rooms_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tournament_questions"
    ADD CONSTRAINT "tournament_questions_pkey" PRIMARY KEY ("tournament_id", "question_id");



ALTER TABLE ONLY "public"."tournaments"
    ADD CONSTRAINT "tournaments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tournaments"
    ADD CONSTRAINT "tournaments_room_id_key" UNIQUE ("room_id");



CREATE INDEX "bot_intents_participant_idx" ON "public"."bot_intents" USING "btree" ("participant_id");



CREATE INDEX "bot_intents_penalty_idx" ON "public"."bot_intents" USING "btree" ("penalty_id");



CREATE INDEX "bot_intents_pending_idx" ON "public"."bot_intents" USING "btree" ("scheduled_answer_at") WHERE ("materialized" = false);



CREATE INDEX "matches_away_participant_idx" ON "public"."matches" USING "btree" ("away_participant_id");



CREATE INDEX "matches_home_participant_idx" ON "public"."matches" USING "btree" ("home_participant_id");



CREATE INDEX "matches_status_idx" ON "public"."matches" USING "btree" ("status");



CREATE INDEX "matches_tournament_idx" ON "public"."matches" USING "btree" ("tournament_id");



CREATE INDEX "matches_winner_participant_idx" ON "public"."matches" USING "btree" ("winner_participant_id");



CREATE INDEX "participants_nation_idx" ON "public"."participants" USING "btree" ("nation_id");



CREATE INDEX "participants_tournament_idx" ON "public"."participants" USING "btree" ("tournament_id");



CREATE INDEX "participants_user_idx" ON "public"."participants" USING "btree" ("user_id") WHERE ("user_id" IS NOT NULL);



CREATE INDEX "penalties_keeper_participant_idx" ON "public"."penalties" USING "btree" ("keeper_participant_id");



CREATE INDEX "penalties_kicker_participant_idx" ON "public"."penalties" USING "btree" ("kicker_participant_id");



CREATE INDEX "penalties_match_idx" ON "public"."penalties" USING "btree" ("match_id");



CREATE INDEX "penalties_open_deadline_idx" ON "public"."penalties" USING "btree" ("deadline") WHERE ("status" = ANY (ARRAY['open'::"public"."penalty_status", 'second_chance'::"public"."penalty_status"]));



CREATE INDEX "penalties_question_idx" ON "public"."penalties" USING "btree" ("question_id");



CREATE INDEX "penalty_answers_participant_idx" ON "public"."penalty_answers" USING "btree" ("participant_id");



CREATE INDEX "penalty_answers_penalty_idx" ON "public"."penalty_answers" USING "btree" ("penalty_id");



CREATE UNIQUE INDEX "profiles_username_lower_key" ON "public"."profiles" USING "btree" ("lower"("username"));



CREATE INDEX "rooms_host_idx" ON "public"."rooms" USING "btree" ("host_id");



CREATE INDEX "rooms_lobby_starts_at_idx" ON "public"."rooms" USING "btree" ("starts_at") WHERE ("status" = 'lobby'::"public"."room_status");



CREATE INDEX "tournament_questions_question_idx" ON "public"."tournament_questions" USING "btree" ("question_id");



CREATE INDEX "tournaments_champion_idx" ON "public"."tournaments" USING "btree" ("champion_participant_id");



CREATE INDEX "tournaments_third_place_idx" ON "public"."tournaments" USING "btree" ("third_place_participant_id");



CREATE OR REPLACE TRIGGER "profiles_set_updated_at" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



ALTER TABLE ONLY "public"."bot_intents"
    ADD CONSTRAINT "bot_intents_participant_id_fkey" FOREIGN KEY ("participant_id") REFERENCES "public"."participants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."bot_intents"
    ADD CONSTRAINT "bot_intents_penalty_id_fkey" FOREIGN KEY ("penalty_id") REFERENCES "public"."penalties"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."matches"
    ADD CONSTRAINT "matches_away_participant_id_fkey" FOREIGN KEY ("away_participant_id") REFERENCES "public"."participants"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."matches"
    ADD CONSTRAINT "matches_home_participant_id_fkey" FOREIGN KEY ("home_participant_id") REFERENCES "public"."participants"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."matches"
    ADD CONSTRAINT "matches_tournament_id_fkey" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."matches"
    ADD CONSTRAINT "matches_winner_participant_id_fkey" FOREIGN KEY ("winner_participant_id") REFERENCES "public"."participants"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."participants"
    ADD CONSTRAINT "participants_nation_id_fkey" FOREIGN KEY ("nation_id") REFERENCES "public"."nations"("id");



ALTER TABLE ONLY "public"."participants"
    ADD CONSTRAINT "participants_tournament_id_fkey" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."participants"
    ADD CONSTRAINT "participants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."penalties"
    ADD CONSTRAINT "penalties_keeper_participant_id_fkey" FOREIGN KEY ("keeper_participant_id") REFERENCES "public"."participants"("id");



ALTER TABLE ONLY "public"."penalties"
    ADD CONSTRAINT "penalties_kicker_participant_id_fkey" FOREIGN KEY ("kicker_participant_id") REFERENCES "public"."participants"("id");



ALTER TABLE ONLY "public"."penalties"
    ADD CONSTRAINT "penalties_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."penalties"
    ADD CONSTRAINT "penalties_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id");



ALTER TABLE ONLY "public"."penalty_answers"
    ADD CONSTRAINT "penalty_answers_participant_id_fkey" FOREIGN KEY ("participant_id") REFERENCES "public"."participants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."penalty_answers"
    ADD CONSTRAINT "penalty_answers_penalty_id_fkey" FOREIGN KEY ("penalty_id") REFERENCES "public"."penalties"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."rooms"
    ADD CONSTRAINT "rooms_host_id_fkey" FOREIGN KEY ("host_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."tournament_questions"
    ADD CONSTRAINT "tournament_questions_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tournament_questions"
    ADD CONSTRAINT "tournament_questions_tournament_id_fkey" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tournaments"
    ADD CONSTRAINT "tournaments_champion_fk" FOREIGN KEY ("champion_participant_id") REFERENCES "public"."participants"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."tournaments"
    ADD CONSTRAINT "tournaments_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tournaments"
    ADD CONSTRAINT "tournaments_third_place_fk" FOREIGN KEY ("third_place_participant_id") REFERENCES "public"."participants"("id") ON DELETE SET NULL;



ALTER TABLE "public"."bot_intents" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."matches" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."nations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "nations_select_authenticated" ON "public"."nations" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."participants" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "participants_select_member" ON "public"."participants" FOR SELECT TO "authenticated" USING ("public"."is_tournament_member"("tournament_id"));



ALTER TABLE "public"."penalties" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."penalty_answers" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "profiles_select_own" ON "public"."profiles" FOR SELECT USING ((( SELECT "auth"."uid"() AS "uid") = "id"));



CREATE POLICY "profiles_update_own" ON "public"."profiles" FOR UPDATE USING ((( SELECT "auth"."uid"() AS "uid") = "id")) WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "id"));



ALTER TABLE "public"."questions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."rate_limits" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."rooms" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "rooms_select_member" ON "public"."rooms" FOR SELECT TO "authenticated" USING ((("host_id" = ( SELECT "auth"."uid"() AS "uid")) OR "public"."is_room_member"("id")));



ALTER TABLE "public"."tournament_questions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."tournaments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "tournaments_select_member" ON "public"."tournaments" FOR SELECT TO "authenticated" USING ("public"."is_tournament_member"("id"));





ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";








GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";

















































































































































































REVOKE ALL ON FUNCTION "public"."abandon"("p_match" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."abandon"("p_match" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."advance_ko_round"("p_tournament" "uuid") FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."advance_tournament"("p_tournament" "uuid") FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."assign_round_question"("p_match" "uuid", "p_idx" integer) FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."bot_penalty_scored"("p_seedp" bigint, "p_k_tier" "public"."difficulty_tier", "p_g_tier" "public"."difficulty_tier", "p_kicker" "uuid", "p_keeper" "uuid") FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."build_knockout"("p_tournament" "uuid") FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."cleanup_stale_rooms"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."create_room"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_room"() TO "authenticated";



REVOKE ALL ON FUNCTION "public"."emit_score_live"("p_match" "uuid") FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."enforce_rate_limit"("p_action" "text", "p_max" integer, "p_window" interval) FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."engine_advance_match"("p_kind" "text", "p_scored" boolean[], OUT "status" "text", OUT "next_index" integer, OUT "next_kicker" "text", OUT "home" integer, OUT "away" integer, OUT "winner" "text") FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."engine_bot_intent"("p_tier" "public"."difficulty_tier", "p_seed" bigint, OUT "will_be_correct" boolean, OUT "delay_ms" integer) FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."engine_fnv32"("p_text" "text") FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."engine_group_standings"("p_tournament" "uuid", "p_group" "text") FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."engine_hash32"("p_text" "text") FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."engine_imul"("x" bigint, "y" bigint) FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."engine_mulberry32"("p_seed" bigint) FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."engine_rand_bool"("p_seed" bigint) FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."engine_rand_int"("p_seed" bigint, "p_n" integer) FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."finalize_match"("p_match" "uuid") FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."gen_room_code"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."get_active_match"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_active_match"() TO "authenticated";



REVOKE ALL ON FUNCTION "public"."get_active_tournament"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_active_tournament"() TO "authenticated";



REVOKE ALL ON FUNCTION "public"."get_bracket"("p_tournament" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_bracket"("p_tournament" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."get_match_penals"("p_match" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_match_penals"("p_match" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."get_match_scene"("p_match" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_match_scene"("p_match" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."get_tournament_history"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_tournament_history"() TO "authenticated";



REVOKE ALL ON FUNCTION "public"."handle_new_user"() FROM PUBLIC;



GRANT ALL ON FUNCTION "public"."is_match_member"("p_match" "uuid") TO "authenticated";



GRANT ALL ON FUNCTION "public"."is_room_member"("p_room" "uuid") TO "authenticated";



GRANT ALL ON FUNCTION "public"."is_tournament_member"("p_tournament" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."join_room"("p_code" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."join_room"("p_code" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."leave_room"("p_code" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."leave_room"("p_code" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."materialize_bot_intents"("p_penalty" "uuid", "p_force" boolean) FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."open_next_round"("p_tournament" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."open_next_round"("p_tournament" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."open_penalty"("p_penalty" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."open_penalty"("p_penalty" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."open_penalty_internal"("p_penalty" "uuid") FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."open_round"("p_tournament" "uuid") FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."open_round_penals"("p_tournament" "uuid") FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."participant_brief"("p_part" "uuid") FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."precompute_bot_intents"("p_penalty" "uuid") FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."progress_match"("p_match" "uuid") FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."quick_play"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."quick_play"() TO "authenticated";



GRANT ALL ON FUNCTION "public"."realtime_match_member"("p_topic" "text") TO "authenticated";



GRANT ALL ON FUNCTION "public"."realtime_tournament_member"("p_topic" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."resolve_penalty"("p_penalty" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."resolve_penalty"("p_penalty" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."resolve_round"("p_tournament" "uuid") FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."rls_auto_enable"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."select_option"("p_penalty" "uuid", "p_option" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."select_option"("p_penalty" "uuid", "p_option" integer) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."set_updated_at"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."simulate_bot_match"("p_match" "uuid") FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."start_tournament"("p_room" "uuid") FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."take_tournament_question"("p_tournament" "uuid", "p_difficulty" "public"."difficulty", "p_seed" bigint) FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."tanda_penalty_difficulty"("p_phase" "public"."match_phase", "p_idx" integer) FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."tick"() FROM PUBLIC;



GRANT ALL ON FUNCTION "public"."username_available"("check_name" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."username_available"("check_name" "text") TO "authenticated";
























GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."bot_intents" TO "anon";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."bot_intents" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."bot_intents" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."matches" TO "anon";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."matches" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."matches" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."nations" TO "anon";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."nations" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."nations" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."participants" TO "anon";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."participants" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."participants" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."penalties" TO "anon";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."penalties" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."penalties" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."penalty_answers" TO "anon";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."penalty_answers" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."penalty_answers" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."profiles" TO "anon";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."profiles" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."profiles" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."questions" TO "anon";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."questions" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."questions" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."rate_limits" TO "anon";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."rate_limits" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."rate_limits" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."rooms" TO "anon";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."rooms" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."rooms" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."tournament_questions" TO "anon";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."tournament_questions" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."tournament_questions" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."tournaments" TO "anon";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."tournaments" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."tournaments" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT UPDATE ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT UPDATE ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT UPDATE ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLES TO "service_role";




































--
-- Dumped schema changes for auth and storage
--

CREATE OR REPLACE TRIGGER "on_auth_user_created" AFTER INSERT ON "auth"."users" FOR EACH ROW EXECUTE FUNCTION "public"."handle_new_user"();



