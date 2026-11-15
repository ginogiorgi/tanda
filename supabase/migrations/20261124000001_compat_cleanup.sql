-- Limpieza de compat (feedback 2, P2.3). F2 y F3b dejaron puentes para el front viejo durante su deploy;
-- el front de prod ya no los lee (verificado: ningún archivo de app/components/lib usa `placement_left`
-- ni `divisions`):
--  · `ranked_players.placement_left` (0 desde K=32 fijo) → se dropea la columna y sale de
--    `ranked_apply_result` (firma nueva, sin `p_placement`), `ranked_create_match`, `ranked_settle`,
--    `ranked_roll_season`, `get_ranked_me` y `get_ranking` (que además deja de mandar `placement`).
--  · `get_profile_stats` deja de mandar `divisions: []`.
-- Paridad TS↔SQL de `ranked_apply_result`: supabase/tests/ranked.test.ts.

drop function public.ranked_apply_result(int, int, int, int, boolean);

create or replace function public.ranked_apply_result(
  p_rating int, p_shield int, p_opp int, p_won boolean
)
returns table (rating int, shield int, delta int, promoted boolean, demoted boolean, shield_saved boolean)
language plpgsql immutable set search_path to ''
as $$
declare
  v_k constant int := 32;  -- sin ubicación: toda partida vale lo mismo
  v_e float8; v_raw int; v_d int; v_from int; v_to int; v_r int; v_s int; v_saved boolean := false;
begin
  v_e := 1.0::float8 / (1.0::float8 + power(10.0::float8, (p_opp - p_rating)::float8 / 400.0::float8));
  v_raw := floor(v_k::float8 * ((case when p_won then 1 else 0 end)::float8 - v_e) + 0.5::float8)::int;
  v_d := case when p_won then greatest(v_raw, 4) else least(v_raw, -4) end;
  v_from := public.ranked_division(p_rating);
  v_r := greatest(0, p_rating + v_d);
  v_s := p_shield;
  if not p_won and v_s > 0 then
    if v_r < public.ranked_division_min(v_from) then
      v_r := public.ranked_division_min(v_from);
      v_saved := true;
    end if;
    v_s := v_s - 1;
  end if;
  v_to := public.ranked_division(v_r);
  if v_to > v_from then v_s := 3; end if;
  return query select v_r, v_s, v_r - p_rating, v_to > v_from, v_to < v_from, v_saved;
end;
$$;

create or replace function public.ranked_create_match(p_home uuid, p_away uuid)
returns uuid
language plpgsql security definer set search_path to ''
as $$
declare
  v_room uuid; v_t uuid; v_ph uuid; v_pa uuid;
  h public.ranked_players; a public.ranked_players;
  hw record; hl record; aw record; al record;
begin
  h := public.ranked_ensure_player(p_home);
  a := public.ranked_ensure_player(p_away);

  insert into public.rooms (code, host_id, status, starts_at, mode_id)
    values (public.gen_room_code(), p_home, 'in_progress', now(), 'ranked')
    returning id into v_room;
  -- 8s de presentación (cara a cara + lo que está en juego) antes del primer penal.
  insert into public.tournaments (room_id, status, current_phase, seed, mode_id, round_deadline)
    values (v_room, 'in_progress', 'final', (random() * 9.2e18)::bigint, 'ranked', now() + interval '8 seconds')
    returning id into v_t;
  insert into public.participants (tournament_id, user_id, is_bot) values (v_t, p_home, false) returning id into v_ph;
  insert into public.participants (tournament_id, user_id, is_bot) values (v_t, p_away, false) returning id into v_pa;
  insert into public.matches (tournament_id, phase, bracket_slot, home_participant_id, away_participant_id, is_bot_only, status)
    values (v_t, 'final', 0, v_ph, v_pa, false, 'pending');

  select * into hw from public.ranked_apply_result(h.rating, h.shield, a.rating, true);
  select * into hl from public.ranked_apply_result(h.rating, h.shield, a.rating, false);
  select * into aw from public.ranked_apply_result(a.rating, a.shield, h.rating, true);
  select * into al from public.ranked_apply_result(a.rating, a.shield, h.rating, false);

  insert into public.ranked_matches
    (tournament_id, season_id, home_user, away_user, home_participant, away_participant,
     home_rating, away_rating, home_stakes, away_stakes, avg_rating)
  values
    (v_t, h.season_id, p_home, p_away, v_ph, v_pa, h.rating, a.rating,
     jsonb_build_object('win', hw.delta, 'loss', hl.delta),
     jsonb_build_object('win', aw.delta, 'loss', al.delta),
     (h.rating + a.rating) / 2);

  delete from public.ranked_queue where user_id in (p_home, p_away);
  return v_t;
end;
$$;

create or replace function public.ranked_settle(p_tournament uuid)
returns void
language plpgsql security definer set search_path to ''
as $$
declare
  rm public.ranked_matches; v_champ uuid; v_home_won boolean;
  ph public.ranked_players; pa public.ranked_players; rh record; ra record;
begin
  select * into rm from public.ranked_matches where tournament_id = p_tournament for update;
  if rm.tournament_id is null or rm.settled_at is not null then return; end if;

  select champion_participant_id into v_champ from public.tournaments where id = p_tournament;
  if v_champ is null then return; end if;
  v_home_won := (v_champ = rm.home_participant);

  -- Lock en orden estable (sin deadlocks entre dos settles cruzados).
  perform 1 from public.ranked_players where user_id in (rm.home_user, rm.away_user)
    order by user_id for update;
  select * into ph from public.ranked_players where user_id = rm.home_user;
  select * into pa from public.ranked_players where user_id = rm.away_user;

  -- Contra el rating de ENTRADA del rival (lo que se mostró en "lo que está en juego").
  select * into rh from public.ranked_apply_result(ph.rating, ph.shield, rm.away_rating, v_home_won);
  select * into ra from public.ranked_apply_result(pa.rating, pa.shield, rm.home_rating, not v_home_won);

  update public.ranked_players set
    rating = rh.rating, shield = rh.shield,
    games = games + 1, wins = wins + v_home_won::int,
    season_games = season_games + 1, season_wins = season_wins + v_home_won::int,
    season_peak = greatest(season_peak, rh.rating),
    last_opponent = rm.away_user, updated_at = now()
  where user_id = rm.home_user;

  update public.ranked_players set
    rating = ra.rating, shield = ra.shield,
    games = games + 1, wins = wins + (not v_home_won)::int,
    season_games = season_games + 1, season_wins = season_wins + (not v_home_won)::int,
    season_peak = greatest(season_peak, ra.rating),
    last_opponent = rm.home_user, updated_at = now()
  where user_id = rm.away_user;

  update public.ranked_matches set
    winner_user = case when v_home_won then rm.home_user else rm.away_user end,
    home_result = jsonb_build_object('delta', rh.delta, 'rating', rh.rating, 'promoted', rh.promoted,
      'demoted', rh.demoted, 'shield_saved', rh.shield_saved, 'shield', rh.shield),
    away_result = jsonb_build_object('delta', ra.delta, 'rating', ra.rating, 'promoted', ra.promoted,
      'demoted', ra.demoted, 'shield_saved', ra.shield_saved, 'shield', ra.shield),
    settled_at = now()
  where tournament_id = p_tournament;
end;
$$;

create or replace function public.ranked_roll_season(p_user uuid default null)
returns text
language plpgsql security definer set search_path to ''
as $$
declare
  v_cur text := public.ranked_season_id(now());
  v_year int := extract(year from now() at time zone 'UTC')::int;
  v_first_half boolean := extract(month from now() at time zone 'UTC') <= 6;
begin
  insert into public.ranked_seasons (id, name, starts_at, ends_at)
  values (
    v_cur,
    (case when v_first_half then 'Apertura ' else 'Clausura ' end) || v_year,
    make_timestamptz(v_year, case when v_first_half then 1 else 7 end, 1, 0, 0, 0, 'UTC'),
    case when v_first_half then make_timestamptz(v_year, 7, 1, 0, 0, 0, 'UTC')
         else make_timestamptz(v_year + 1, 1, 1, 0, 0, 0, 'UTC') end
  )
  on conflict (id) do nothing;

  insert into public.ranked_season_results (user_id, season_id, final_rating, peak_rating, games, wins)
  select rp.user_id, rp.season_id, rp.rating, rp.season_peak, rp.season_games, rp.season_wins
  from public.ranked_players rp
  where rp.season_id <> v_cur and rp.season_games > 0 and (p_user is null or rp.user_id = p_user)
  on conflict (user_id, season_id) do nothing;

  -- Reset suave (port de seasonReset): 1500 + trunc((r-1500)/2), sin escudo. Sin ubicación (14/11).
  update public.ranked_players rp
    set rating = 1500 + (rp.rating - 1500) / 2,
        shield = 0,
        season_id = v_cur, season_games = 0, season_wins = 0,
        season_peak = 1500 + (rp.rating - 1500) / 2,
        updated_at = now()
  where rp.season_id <> v_cur and (p_user is null or rp.user_id = p_user);

  return v_cur;
end;
$$;

create or replace function public.get_ranked_me()
returns jsonb
language plpgsql security definer set search_path to ''
as $$
declare uid uuid := (select auth.uid()); v_p public.ranked_players; v_cur text; v_pos int;
begin
  if uid is null then raise exception 'unauthenticated'; end if;
  v_cur := public.ranked_season_id(now());
  select * into v_p from public.ranked_players where user_id = uid;
  if v_p.user_id is null then
    return jsonb_build_object('rating', 1500, 'shield', 0, 'games', 0, 'wins', 0,
      'season_id', v_cur, 'season_games', 0, 'season_wins', 0, 'position', null);
  end if;
  if v_p.season_id <> v_cur then
    -- Temporada vencida y todavía no rolada (sin tick): mostrar ya el reset que le va a tocar.
    return jsonb_build_object('rating', 1500 + (v_p.rating - 1500) / 2, 'shield', 0,
      'games', v_p.games, 'wins', v_p.wins, 'season_id', v_cur, 'season_games', 0, 'season_wins', 0,
      'position', null);
  end if;
  if v_p.season_games > 0 then
    select count(*) + 1 into v_pos from public.ranked_players rp
      where rp.season_id = v_cur and rp.season_games > 0
        and (rp.rating > v_p.rating or (rp.rating = v_p.rating and rp.season_wins > v_p.season_wins));
  end if;
  return jsonb_build_object('rating', v_p.rating, 'shield', v_p.shield,
    'games', v_p.games, 'wins', v_p.wins, 'season_id', v_p.season_id, 'season_games', v_p.season_games,
    'season_wins', v_p.season_wins, 'position', v_pos);
end;
$$;

create or replace function public.get_ranking(p_limit int default 50)
returns jsonb
language plpgsql stable security definer set search_path to ''
as $$
declare uid uuid := (select auth.uid()); v_cur text := public.ranked_season_id(now()); v_rows jsonb; v_me jsonb;
begin
  if uid is null then raise exception 'unauthenticated'; end if;

  with ranked as (
    select rp.user_id, pr.username, rp.rating, rp.season_games, rp.season_wins,
           row_number() over (order by rp.rating desc, rp.season_wins desc, rp.updated_at asc) as pos
    from public.ranked_players rp
    join public.profiles pr on pr.id = rp.user_id
    where rp.season_id = v_cur and rp.season_games > 0
  )
  select
    coalesce((select jsonb_agg(jsonb_build_object(
        'position', r.pos, 'username', r.username, 'rating', r.rating,
        'division', public.ranked_division_id(public.ranked_division(r.rating)),
        'games', r.season_games, 'wins', r.season_wins,
        'is_me', r.user_id = uid) order by r.pos)
      from ranked r where r.pos <= least(greatest(coalesce(p_limit, 50), 1), 100)), '[]'::jsonb),
    (select jsonb_build_object(
        'position', r.pos, 'username', r.username, 'rating', r.rating,
        'division', public.ranked_division_id(public.ranked_division(r.rating)),
        'games', r.season_games, 'wins', r.season_wins, 'is_me', true)
      from ranked r where r.user_id = uid)
  into v_rows, v_me;

  return jsonb_build_object('season_id', v_cur, 'rows', v_rows, 'me', v_me);
end;
$$;

create or replace function public.get_profile_stats()
returns jsonb
language plpgsql stable security definer set search_path to ''
as $$
declare uid uuid := (select auth.uid()); v_seasons jsonb; v_current jsonb; v_cups jsonb; v_ranked jsonb;
begin
  if uid is null then raise exception 'unauthenticated'; end if;

  select coalesce(jsonb_agg(jsonb_build_object('season_id', a.competition_id, 'division', a.award)
                            order by s.starts_at desc), '[]'::jsonb)
    into v_seasons
    from public.awards a join public.ranked_seasons s on s.id = a.competition_id
   where a.user_id = uid and a.competition_kind = 'ranked_season';

  select jsonb_build_object(
           'season_id', rp.season_id,
           'division', public.ranked_division_id(public.ranked_division(rp.rating)),
           'games', rp.season_games)
    into v_current
    from public.ranked_players rp
   where rp.user_id = uid and rp.season_games > 0;

  select jsonb_object_agg(c.mode_id, c.counts)
    into v_cups
    from (
      select gm.id as mode_id, jsonb_build_object(
          'gold', count(a.id) filter (where a.award = 'gold'),
          'silver', count(a.id) filter (where a.award = 'silver'),
          'bronze', count(a.id) filter (where a.award = 'bronze')) as counts
        from public.game_modes gm
        left join public.awards a
          on a.mode_id = gm.id and a.user_id = uid and a.competition_kind = 'tournament'
       where gm.id <> 'ranked'
       group by gm.id
    ) c;

  select jsonb_build_object('games', rp.games, 'wins', rp.wins, 'rating', rp.rating)
    into v_ranked from public.ranked_players rp where rp.user_id = uid;

  return jsonb_build_object(
    'seasons', v_seasons,
    'current', v_current,
    'cups', coalesce(v_cups, '{}'::jsonb),
    'ranked', v_ranked);
end;
$$;

-- La firma nueva nace sin EXECUTE para el cliente (default privileges de …24000000); explícito igual.
revoke execute on function public.ranked_apply_result(int, int, int, boolean) from public, anon, authenticated;

alter table public.ranked_players drop column placement_left;
