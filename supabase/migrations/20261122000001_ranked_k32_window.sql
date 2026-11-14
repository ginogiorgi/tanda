-- Ranked (feedback de Gino 14/11):
--  1) Ventana de emparejamiento más ancha y OCULTA: ±300 los primeros 10 s, ±600 hasta los 20 s,
--     después cualquier humano. `ranked_poll` deja de mandarle la ventana al cliente.
--  2) Sin partidas de ubicación: K = 32 SIEMPRE (antes K=64 las 5 primeras → el "+32/−32" que vio Gino
--     no venía de la cola sino de la ubicación). `ranked_apply_result` conserva la firma (p_placement se
--     ignora) para no tocar callers; `placement_left` queda en 0 y se dropea en una migración posterior.
--  3) Corrección retroactiva: re-aplica los partidos ya liquidados con K=32 desde 1500 (backup antes).
-- Paridad con lib/engine/ranked.ts (queueWindow, applyResult) en supabase/tests/ranked.test.ts.

create or replace function public.ranked_queue_window(p_waited float8)
returns int
language sql immutable set search_path to ''
as $$ select case when p_waited < 10 then 300 when p_waited < 20 then 600 else null end; $$;

create or replace function public.ranked_apply_result(
  p_rating int, p_placement int, p_shield int, p_opp int, p_won boolean
)
returns table (rating int, placement_left int, shield int, delta int, promoted boolean, demoted boolean, shield_saved boolean)
language plpgsql immutable set search_path to ''
as $$
declare
  v_k constant int := 32;  -- sin ubicación: toda partida vale lo mismo (p_placement se ignora)
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
  return query select v_r, 0, v_s, v_r - p_rating, v_to > v_from, v_to < v_from, v_saved;
end;
$$;

create or replace function public.ranked_poll()
returns jsonb
language plpgsql security definer set search_path to ''
as $$
declare
  uid uuid := (select auth.uid()); v_t uuid; v_enq timestamptz; v_rating int; v_waited float8;
begin
  if uid is null then raise exception 'unauthenticated'; end if;

  v_t := public.ranked_active_tournament(uid);
  if v_t is not null then
    return jsonb_build_object('status', 'matched', 'tournament_id', v_t);
  end if;

  update public.ranked_queue set last_seen = now() where user_id = uid
    returning enqueued_at, rating into v_enq, v_rating;
  if v_enq is null then return jsonb_build_object('status', 'idle'); end if;

  v_t := public.ranked_try_match(uid);
  if v_t is not null then
    return jsonb_build_object('status', 'matched', 'tournament_id', v_t);
  end if;

  v_waited := extract(epoch from now() - v_enq);
  return jsonb_build_object(
    'status', 'queued',
    'waited_ms', (v_waited * 1000)::bigint,
    'rating', v_rating,
    'in_queue', (select count(*) from public.ranked_queue q where q.last_seen > now() - interval '8 seconds'),
    'server_now', now()
  );
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
        placement_left = 0, shield = 0,
        season_id = v_cur, season_games = 0, season_wins = 0,
        season_peak = 1500 + (rp.rating - 1500) / 2,
        updated_at = now()
  where rp.season_id <> v_cur and (p_user is null or rp.user_id = p_user);

  return v_cur;
end;
$$;

alter table public.ranked_players alter column placement_left set default 0;

-- 3) Replay retroactivo con K=32 (backup primero; idempotente: recalcula siempre desde 1500).
create table if not exists public.ranked_players_backup_1411 as
  select rp.*, now() as backed_up_at from public.ranked_players rp;
alter table public.ranked_players_backup_1411 enable row level security;
revoke all on table public.ranked_players_backup_1411 from anon, authenticated;

do $replay$
declare
  m record; h record; a record; rh record; ra record; v_home_won boolean;
begin
  if (select count(distinct season_id) from public.ranked_matches where settled_at is not null) > 1 then
    raise notice 'ranked replay: más de una temporada con partidos → no se recalcula (revisar a mano)';
  else
    create temp table rp_replay (user_id uuid primary key, rating int not null, shield int not null, peak int not null)
      on commit drop;
    insert into rp_replay (user_id, rating, shield, peak)
      select u, 1500, 0, 1500 from (
        select home_user u from public.ranked_matches where settled_at is not null
        union select away_user from public.ranked_matches where settled_at is not null
      ) x;

    for m in select * from public.ranked_matches where settled_at is not null order by settled_at, created_at loop
      v_home_won := (m.winner_user = m.home_user);
      select * into h from rp_replay where user_id = m.home_user;
      select * into a from rp_replay where user_id = m.away_user;
      select * into rh from public.ranked_apply_result(h.rating, 0, h.shield, a.rating, v_home_won);
      select * into ra from public.ranked_apply_result(a.rating, 0, a.shield, h.rating, not v_home_won);
      update rp_replay set rating = rh.rating, shield = rh.shield, peak = greatest(peak, rh.rating) where user_id = m.home_user;
      update rp_replay set rating = ra.rating, shield = ra.shield, peak = greatest(peak, ra.rating) where user_id = m.away_user;
      update public.ranked_matches set
        home_rating = h.rating, away_rating = a.rating,
        home_result = jsonb_build_object('delta', rh.delta, 'rating', rh.rating, 'promoted', rh.promoted,
          'demoted', rh.demoted, 'shield_saved', rh.shield_saved, 'shield', rh.shield, 'placement_left', 0),
        away_result = jsonb_build_object('delta', ra.delta, 'rating', ra.rating, 'promoted', ra.promoted,
          'demoted', ra.demoted, 'shield_saved', ra.shield_saved, 'shield', ra.shield, 'placement_left', 0)
      where tournament_id = m.tournament_id;
    end loop;

    update public.ranked_players rp
      set rating = r.rating, shield = r.shield, season_peak = r.peak, updated_at = now()
      from rp_replay r where r.user_id = rp.user_id;
  end if;

  update public.ranked_players set placement_left = 0 where placement_left <> 0;
  update public.ranked_queue q set rating = rp.rating from public.ranked_players rp where rp.user_id = q.user_id;
end
$replay$;
