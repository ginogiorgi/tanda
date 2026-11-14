-- ════════════════════════════════════════════════════════════════════════════
-- Tanda 2.0 — Fase 4b: RANKED 1v1 (cola de liga).
--
-- Un partido ranked es un torneo de modo `ranked` con 2 participantes humanos y un único match
-- `final` (5 penales por lado + muerte súbita). Así reusa TODO el stack autoritativo (reloj de
-- ronda, select_option, resolve_penalty idempotente, escena con los avatares de profiles).
--   · `game_modes.ranked` con active=false: `active` = elegible en Jugar/Crear sala, así que
--     quick_play/create_room ya lo rechazan (invalid_mode). Solo se entra por la cola.
--   · Rating Elo (port fiel de lib/engine/ranked.ts, paridad): K 64 en ubicación / 32, piso ±4,
--     divisiones Potrero→Leyenda, escudo de 3 derrotas al ascender.
--   · Cola solo humanos: ventana ±100 (0–10s) → ±250 (10–20s) → cualquiera (≥20s); el más viejo
--     primero; evita revancha inmediata si hay otra opción. Lock de advisory global.
--   · Temporadas por torneo real (Apertura ene–jun / Clausura jul–dic, UTC): al cambiar, se guarda
--     el resultado y reset suave a mitad de camino de 1500 + 3 de ubicación.
--   · Abandonar = derrota inmediata (forfeit). Desconexión = sigue con respuestas al azar.
--   · Preguntas de los bancos activos mezclados; dificultad según el rating promedio.
-- ════════════════════════════════════════════════════════════════════════════

-- ───────────────────────── 0) Trigger auth.users → profiles ─────────────────────────
-- Vive en prod desde siempre pero el baseline (dump de `public`) no lo traía: lo dejamos versionado
-- (idempotente) para que la DB local/CI sea igual a prod. Ranked referencia profiles por FK.
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ───────────────────────── 1) Modo ─────────────────────────
insert into public.game_modes
  (id, name, room_size, zones, zone_size, matchdays, qualifiers_per_zone, best_thirds, knockout_start, third_place, tiebreak, active, sort)
values ('ranked', 'Ranked', 2, 1, 2, 1, 1, 0, 'final', false, 'goals', false, 3)
on conflict (id) do nothing;

-- ───────────────────────── 2) Tablas ─────────────────────────
create table public.ranked_seasons (
  id text primary key,                       -- 'clausura-2026'
  name text not null,                        -- 'Clausura 2026'
  starts_at timestamptz not null,
  ends_at timestamptz not null
);
comment on table public.ranked_seasons is 'Temporadas ranked (por torneo real: Apertura/Clausura, UTC).';

create table public.ranked_players (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  rating int not null default 1500 check (rating >= 0),
  placement_left int not null default 5 check (placement_left >= 0),
  shield int not null default 0 check (shield between 0 and 3),
  games int not null default 0,
  wins int not null default 0,
  season_id text not null references public.ranked_seasons(id),
  season_games int not null default 0,
  season_wins int not null default 0,
  season_peak int not null default 1500,
  last_opponent uuid,
  updated_at timestamptz not null default now()
);
create index ranked_players_season_rating_idx on public.ranked_players (season_id, rating desc);
comment on table public.ranked_players is 'Estado de liga por jugador (rating, ubicación, escudo, temporada en curso).';

create table public.ranked_season_results (
  user_id uuid not null references public.profiles(id) on delete cascade,
  season_id text not null references public.ranked_seasons(id),
  final_rating int not null,
  peak_rating int not null,
  games int not null,
  wins int not null,
  primary key (user_id, season_id)
);
comment on table public.ranked_season_results is 'Cierre de temporada por jugador (mejor división alcanzada = peak).';

create table public.ranked_queue (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  rating int not null,
  enqueued_at timestamptz not null default now(),
  last_seen timestamptz not null default now()
);
create index ranked_queue_enqueued_idx on public.ranked_queue (enqueued_at);
comment on table public.ranked_queue is 'Cola ranked (solo la escriben las RPC). last_seen = latido del poll del cliente.';

create table public.ranked_matches (
  tournament_id uuid primary key references public.tournaments(id) on delete cascade,
  season_id text not null references public.ranked_seasons(id),
  home_user uuid not null references public.profiles(id) on delete cascade,
  away_user uuid not null references public.profiles(id) on delete cascade,
  home_participant uuid not null references public.participants(id) on delete cascade,
  away_participant uuid not null references public.participants(id) on delete cascade,
  home_rating int not null,
  away_rating int not null,
  home_stakes jsonb not null,               -- {"win": +X, "loss": -Y}
  away_stakes jsonb not null,
  avg_rating int not null,
  winner_user uuid,
  home_result jsonb,                        -- {delta, rating, promoted, demoted, shield_saved, shield, placement_left}
  away_result jsonb,
  settled_at timestamptz,
  created_at timestamptz not null default now()
);
create index ranked_matches_home_idx on public.ranked_matches (home_user, created_at desc);
create index ranked_matches_away_idx on public.ranked_matches (away_user, created_at desc);
comment on table public.ranked_matches is 'Partido ranked: ratings de entrada, lo que estaba en juego y el resultado aplicado (idempotente).';

-- RLS: todo pasa por RPC SECURITY DEFINER. Sin policies = nadie lee/escribe directo.
alter table public.ranked_seasons enable row level security;
alter table public.ranked_players enable row level security;
alter table public.ranked_season_results enable row level security;
alter table public.ranked_queue enable row level security;
alter table public.ranked_matches enable row level security;
revoke all on table public.ranked_seasons, public.ranked_players, public.ranked_season_results,
  public.ranked_queue, public.ranked_matches from anon, authenticated;

-- ───────────────────────── 3) Motor (port de lib/engine/ranked.ts) ─────────────────────────
create or replace function public.ranked_division(p_rating int)
returns int
language sql immutable set search_path to ''
as $$
  select case
    when p_rating >= 1900 then 5
    when p_rating >= 1750 then 4
    when p_rating >= 1600 then 3
    when p_rating >= 1450 then 2
    when p_rating >= 1300 then 1
    else 0 end;
$$;

create or replace function public.ranked_division_min(p_div int)
returns int
language sql immutable set search_path to ''
as $$ select (array[0, 1300, 1450, 1600, 1750, 1900])[p_div + 1]; $$;

create or replace function public.ranked_division_id(p_div int)
returns text
language sql immutable set search_path to ''
as $$ select (array['potrero', 'barrio', 'ascenso', 'primera', 'libertadores', 'leyenda'])[p_div + 1]; $$;

create or replace function public.ranked_apply_result(
  p_rating int, p_placement int, p_shield int, p_opp int, p_won boolean
)
returns table (rating int, placement_left int, shield int, delta int, promoted boolean, demoted boolean, shield_saved boolean)
language plpgsql immutable set search_path to ''
as $$
declare
  v_k int; v_e float8; v_raw int; v_d int; v_from int; v_to int; v_r int; v_s int; v_saved boolean := false;
begin
  v_k := case when p_placement > 0 then 64 else 32 end;
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
  return query select v_r, greatest(0, p_placement - 1), v_s, v_r - p_rating, v_to > v_from, v_to < v_from, v_saved;
end;
$$;

create or replace function public.ranked_difficulty(p_avg int, p_idx int)
returns public.difficulty
language sql immutable set search_path to ''
as $$
  select case
    when p_avg < 1600 then (case when p_idx <= 6 then 'easy' else 'medium' end)::public.difficulty
    when p_avg < 1900 then (case when p_idx <= 6 then 'medium' else 'hard' end)::public.difficulty
    else (case when p_idx <= 6 then 'hard' else 'very_hard' end)::public.difficulty
  end;
$$;

-- Ventana de rating según la espera (segundos). null = cualquiera.
create or replace function public.ranked_queue_window(p_waited float8)
returns int
language sql immutable set search_path to ''
as $$ select case when p_waited < 10 then 100 when p_waited < 20 then 250 else null end; $$;

create or replace function public.ranked_season_id(p_ts timestamptz)
returns text
language sql immutable set search_path to ''
as $$
  select (case when extract(month from p_ts at time zone 'UTC') <= 6 then 'apertura' else 'clausura' end)
         || '-' || extract(year from p_ts at time zone 'UTC')::int::text;
$$;

-- ───────────────────────── 4) Temporadas ─────────────────────────
-- Asegura la fila de la temporada en curso y cierra la anterior de los jugadores (uno o todos).
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

  -- Reset suave (port de seasonReset): 1500 + trunc((r-1500)/2), 3 de ubicación, sin escudo.
  update public.ranked_players rp
    set rating = 1500 + (rp.rating - 1500) / 2,
        placement_left = 3, shield = 0,
        season_id = v_cur, season_games = 0, season_wins = 0,
        season_peak = 1500 + (rp.rating - 1500) / 2,
        updated_at = now()
  where rp.season_id <> v_cur and (p_user is null or rp.user_id = p_user);

  return v_cur;
end;
$$;

create or replace function public.ranked_ensure_player(p_user uuid)
returns public.ranked_players
language plpgsql security definer set search_path to ''
as $$
declare v_cur text; v_row public.ranked_players;
begin
  v_cur := public.ranked_roll_season(p_user);
  insert into public.ranked_players (user_id, season_id) values (p_user, v_cur)
    on conflict (user_id) do nothing;
  select * into v_row from public.ranked_players where user_id = p_user;
  return v_row;
end;
$$;

-- ───────────────────────── 5) Crear el partido ─────────────────────────
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

  select * into hw from public.ranked_apply_result(h.rating, h.placement_left, h.shield, a.rating, true);
  select * into hl from public.ranked_apply_result(h.rating, h.placement_left, h.shield, a.rating, false);
  select * into aw from public.ranked_apply_result(a.rating, a.placement_left, a.shield, h.rating, true);
  select * into al from public.ranked_apply_result(a.rating, a.placement_left, a.shield, h.rating, false);

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

-- Torneo ranked en curso del usuario (si lo hay).
create or replace function public.ranked_active_tournament(p_user uuid)
returns uuid
language sql stable security definer set search_path to ''
as $$
  select t.id from public.participants p
  join public.tournaments t on t.id = p.tournament_id
  where p.user_id = p_user and t.mode_id = 'ranked' and t.status = 'in_progress'
  order by t.created_at desc limit 1;
$$;

-- ───────────────────────── 6) Matchmaking ─────────────────────────
-- Intenta emparejar a p_user. Serializado por un lock de advisory global (corto: 1 select + inserts).
create or replace function public.ranked_try_match(p_user uuid)
returns uuid
language plpgsql security definer set search_path to ''
as $$
declare
  me public.ranked_queue; v_last uuid; v_opp public.ranked_queue; v_w int;
begin
  perform pg_advisory_xact_lock(hashtext('tanda_ranked_matchmaking'));

  select * into me from public.ranked_queue where user_id = p_user;
  if me.user_id is null then
    return public.ranked_active_tournament(p_user);  -- ya lo emparejó otro
  end if;
  select last_opponent into v_last from public.ranked_players where user_id = p_user;
  v_w := public.ranked_queue_window(extract(epoch from now() - me.enqueued_at));

  select q.* into v_opp
  from public.ranked_queue q
  where q.user_id <> p_user
    and q.last_seen > now() - interval '8 seconds'
    and (
      v_w is null
      or public.ranked_queue_window(extract(epoch from now() - q.enqueued_at)) is null
      or abs(q.rating - me.rating) <= greatest(v_w, public.ranked_queue_window(extract(epoch from now() - q.enqueued_at)))
    )
  order by (q.user_id is not distinct from v_last), q.enqueued_at
  limit 1;

  if v_opp.user_id is null then return null; end if;

  -- Local = el que más esperó.
  if v_opp.enqueued_at <= me.enqueued_at then
    return public.ranked_create_match(v_opp.user_id, p_user);
  end if;
  return public.ranked_create_match(p_user, v_opp.user_id);
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
    'window', public.ranked_queue_window(v_waited),
    'rating', v_rating,
    'in_queue', (select count(*) from public.ranked_queue q where q.last_seen > now() - interval '8 seconds'),
    'server_now', now()
  );
end;
$$;

create or replace function public.ranked_enqueue()
returns jsonb
language plpgsql security definer set search_path to ''
as $$
declare uid uuid := (select auth.uid()); v_busy uuid; v_mode text; v_p public.ranked_players;
begin
  if uid is null then raise exception 'unauthenticated'; end if;
  perform public.enforce_rate_limit('ranked_enqueue', 20, interval '1 minute');

  -- Ocupado en otro torneo (o en un lobby abierto) → no se encola.
  select t.id, t.mode_id into v_busy, v_mode
    from public.participants p
    join public.tournaments t on t.id = p.tournament_id
    join public.rooms r on r.id = t.room_id
    where p.user_id = uid and p.is_bot = false
      and ((t.status = 'in_progress' and p.placement is null and p.eliminated_phase is null)
           or (r.status = 'lobby' and r.starts_at > now()))
    order by t.created_at desc limit 1;
  if v_busy is not null then
    if v_mode = 'ranked' then
      return jsonb_build_object('status', 'matched', 'tournament_id', v_busy);
    end if;
    return jsonb_build_object('status', 'busy', 'tournament_id', v_busy, 'mode_id', v_mode);
  end if;

  v_p := public.ranked_ensure_player(uid);
  insert into public.ranked_queue (user_id, rating) values (uid, v_p.rating)
    on conflict (user_id) do update set last_seen = now(), rating = excluded.rating;
  return public.ranked_poll();
end;
$$;

create or replace function public.ranked_cancel()
returns void
language plpgsql security definer set search_path to ''
as $$
declare uid uuid := (select auth.uid());
begin
  if uid is null then raise exception 'unauthenticated'; end if;
  perform pg_advisory_xact_lock(hashtext('tanda_ranked_matchmaking'));
  delete from public.ranked_queue where user_id = uid;
end;
$$;

-- Backstop de pg_cron: cierra temporadas, limpia colas abandonadas y empareja a todos.
create or replace function public.ranked_tick()
returns void
language plpgsql security definer set search_path to ''
as $$
declare r record;
begin
  perform public.ranked_roll_season(null);
  delete from public.ranked_queue where last_seen < now() - interval '15 seconds';
  for r in select user_id from public.ranked_queue order by enqueued_at limit 200 loop
    begin perform public.ranked_try_match(r.user_id);
    exception when others then raise warning 'ranked_tick try_match(%) failed: %', r.user_id, sqlerrm; end;
  end loop;
end;
$$;

-- ───────────────────────── 7) Resultado (idempotente) ─────────────────────────
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
  select * into rh from public.ranked_apply_result(ph.rating, ph.placement_left, ph.shield, rm.away_rating, v_home_won);
  select * into ra from public.ranked_apply_result(pa.rating, pa.placement_left, pa.shield, rm.home_rating, not v_home_won);

  update public.ranked_players set
    rating = rh.rating, placement_left = rh.placement_left, shield = rh.shield,
    games = games + 1, wins = wins + v_home_won::int,
    season_games = season_games + 1, season_wins = season_wins + v_home_won::int,
    season_peak = greatest(season_peak, rh.rating),
    last_opponent = rm.away_user, updated_at = now()
  where user_id = rm.home_user;

  update public.ranked_players set
    rating = ra.rating, placement_left = ra.placement_left, shield = ra.shield,
    games = games + 1, wins = wins + (not v_home_won)::int,
    season_games = season_games + 1, season_wins = season_wins + (not v_home_won)::int,
    season_peak = greatest(season_peak, ra.rating),
    last_opponent = rm.home_user, updated_at = now()
  where user_id = rm.away_user;

  update public.ranked_matches set
    winner_user = case when v_home_won then rm.home_user else rm.away_user end,
    home_result = jsonb_build_object('delta', rh.delta, 'rating', rh.rating, 'promoted', rh.promoted,
      'demoted', rh.demoted, 'shield_saved', rh.shield_saved, 'shield', rh.shield, 'placement_left', rh.placement_left),
    away_result = jsonb_build_object('delta', ra.delta, 'rating', ra.rating, 'promoted', ra.promoted,
      'demoted', ra.demoted, 'shield_saved', ra.shield_saved, 'shield', ra.shield, 'placement_left', ra.placement_left),
    settled_at = now()
  where tournament_id = p_tournament;
end;
$$;

create or replace function public.ranked_on_tournament_finished()
returns trigger
language plpgsql security definer set search_path to ''
as $$
begin
  perform public.ranked_settle(new.id);
  return null;
end;
$$;

create trigger ranked_settle_on_finish
  after update of status on public.tournaments
  for each row
  when (new.mode_id = 'ranked' and new.status = 'finished' and old.status is distinct from 'finished')
  execute function public.ranked_on_tournament_finished();

-- Abandonar en ranked = derrota inmediata. Lock de penales ANTES que el match (mismo orden que
-- resolve_penalty, que además usa SKIP LOCKED sobre el penal → no se pisan).
create or replace function public.ranked_forfeit(p_match uuid, p_part uuid)
returns void
language plpgsql security definer set search_path to ''
as $$
declare v_t uuid; v_status public.match_status; v_home uuid; v_away uuid;
begin
  perform 1 from public.penalties where match_id = p_match and status <> 'resolved' for update;
  select tournament_id, status, home_participant_id, away_participant_id
    into v_t, v_status, v_home, v_away
    from public.matches where id = p_match for update;

  update public.participants set abandoned = true where id = p_part;
  if v_status = 'finished' then return; end if;

  update public.penalties
    set status = 'resolved',
        resolution = jsonb_build_object('winner', 'keeper', 'scored', false, 'reason', 'forfeit',
                                        'variant', 0, 'phase', 'first', 'won_by_speed', false)
    where match_id = p_match and status <> 'resolved';

  update public.matches
    set status = 'finished',
        winner_participant_id = case when v_home = p_part then v_away else v_home end
    where id = p_match;

  perform public.emit_score_live(p_match);
  perform public.advance_ko_round(v_t);  -- corona → tournaments.finished → trigger → settle
end;
$$;

create or replace function public.abandon(p_match uuid)
returns void
language plpgsql security definer set search_path to ''
as $$
declare
  uid uuid := (select auth.uid());
  v_tournament uuid; v_part uuid; v_mode text; r record;
begin
  if uid is null then raise exception 'unauthenticated'; end if;
  perform public.enforce_rate_limit('abandon', 5, interval '1 minute');

  select m.tournament_id, t.mode_id into v_tournament, v_mode
    from public.matches m join public.tournaments t on t.id = m.tournament_id
    where m.id = p_match;
  if v_tournament is null then raise exception 'match_not_found'; end if;

  select id into v_part from public.participants
    where tournament_id = v_tournament and user_id = uid and is_bot = false;
  if v_part is null then raise exception 'not_participant'; end if;

  if v_mode = 'ranked' then
    perform public.ranked_forfeit(p_match, v_part);
    return;
  end if;

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

-- ───────────────────────── 8) Preguntas: bancos mezclados + dificultad por nivel ─────────────────────────
create or replace function public.match_penalty_difficulty(p_match uuid, p_idx int)
returns public.difficulty
language sql stable security definer set search_path to ''
as $$
  select case when t.mode_id = 'ranked'
    then public.ranked_difficulty(coalesce(rm.avg_rating, 1500), p_idx)
    else public.tanda_penalty_difficulty(m.phase, p_idx) end
  from public.matches m
  join public.tournaments t on t.id = m.tournament_id
  left join public.ranked_matches rm on rm.tournament_id = t.id
  where m.id = p_match;
$$;

create or replace function public.take_tournament_question(p_tournament uuid, p_difficulty public.difficulty, p_seed bigint)
returns uuid
language plpgsql security definer set search_path to ''
as $$
declare
  v_question uuid; v_order public.difficulty[]; v_diff public.difficulty; v_mode text; v_pool text[];
begin
  select mode_id into v_mode from public.tournaments where id = p_tournament;
  -- Ranked: bancos de todos los modos jugables mezclados.
  v_pool := case when v_mode = 'ranked'
    then array(select gm.id from public.game_modes gm where gm.active)
    else array[v_mode] end;

  v_order := case p_difficulty
    when 'easy'      then array['easy','medium','hard','very_hard']::public.difficulty[]
    when 'medium'    then array['medium','easy','hard','very_hard']::public.difficulty[]
    when 'hard'      then array['hard','very_hard','medium','easy']::public.difficulty[]
    when 'very_hard' then array['very_hard','hard','medium','easy']::public.difficulty[]
  end;

  foreach v_diff in array v_order loop
    select q.id into v_question
    from public.questions q
    where q.mode_id = any(v_pool) and q.difficulty = v_diff
      and not exists (select 1 from public.tournament_questions tq
                      where tq.tournament_id = p_tournament and tq.question_id = q.id)
    order by md5(p_seed::text || ':' || q.id::text)
    limit 1;
    exit when v_question is not null;
  end loop;

  if v_question is null then
    select q.id into v_question from public.questions q
    where q.mode_id = any(v_pool) and q.difficulty = p_difficulty
    order by md5(p_seed::text || ':' || q.id::text)
    limit 1;
  end if;

  if v_question is null then
    raise exception 'no_questions_available' using detail = v_mode || ':' || p_difficulty::text;
  end if;

  insert into public.tournament_questions (tournament_id, question_id) values (p_tournament, v_question)
    on conflict do nothing;
  return v_question;
end;
$$;

-- ───────────────────────── 9) Brief: sin equipo → el jugador (nombre + colores de su avatar + escudo de división) ─────────────────────────
create or replace function public.participant_brief(p_part uuid)
returns jsonb
language sql stable security definer set search_path to ''
as $$
  select jsonb_build_object(
    'participant_id', p.id,
    'user_id', p.user_id,
    'is_bot', p.is_bot,
    'team_id', p.team_id,
    'team_code', coalesce(tm.code, upper(left(pr.username, 3))),
    'team_name', coalesce(tm.name, pr.username),
    'team_short', coalesce(tm.short_name, pr.username),
    'flag', tm.flag_asset,
    'crest', coalesce(tm.crest_asset,
      case when tm.id is null and rp.user_id is not null
        then 'div/' || public.ranked_division_id(public.ranked_division(rp.rating)) end),
    'kit_primary', coalesce(tm.kit_primary, pr.avatar #>> '{top,color}', '#1F3FA8'),
    'kit_secondary', coalesce(tm.kit_secondary, pr.avatar #>> '{bottom,color}', '#141414'),
    'kit_tertiary', tm.kit_tertiary,
    'kit_pattern', coalesce(tm.kit_pattern::text, 'solid'),
    'accent', coalesce(tm.accent_color, pr.avatar #>> '{top,color}', '#1F3FA8')
  )
  from public.participants p
  left join public.teams tm on tm.id = p.team_id
  left join public.profiles pr on pr.id = p.user_id and p.team_id is null
  left join public.ranked_players rp on rp.user_id = p.user_id and p.team_id is null
  where p.id = p_part;
$$;

-- ───────────────────────── 10) Lecturas ─────────────────────────
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
    return jsonb_build_object('rating', 1500, 'placement_left', 5, 'shield', 0, 'games', 0, 'wins', 0,
      'season_id', v_cur, 'season_games', 0, 'season_wins', 0, 'position', null);
  end if;
  if v_p.season_id <> v_cur then
    -- Temporada vencida y todavía no rolada (sin tick): mostrar ya el reset que le va a tocar.
    return jsonb_build_object('rating', 1500 + (v_p.rating - 1500) / 2, 'placement_left', 3, 'shield', 0,
      'games', v_p.games, 'wins', v_p.wins, 'season_id', v_cur, 'season_games', 0, 'season_wins', 0,
      'position', null);
  end if;
  if v_p.season_games > 0 then
    select count(*) + 1 into v_pos from public.ranked_players rp
      where rp.season_id = v_cur and rp.season_games > 0
        and (rp.rating > v_p.rating or (rp.rating = v_p.rating and rp.season_wins > v_p.season_wins));
  end if;
  return jsonb_build_object('rating', v_p.rating, 'placement_left', v_p.placement_left, 'shield', v_p.shield,
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
    select rp.user_id, pr.username, rp.rating, rp.season_games, rp.season_wins, rp.placement_left,
           row_number() over (order by rp.rating desc, rp.season_wins desc, rp.updated_at asc) as pos
    from public.ranked_players rp
    join public.profiles pr on pr.id = rp.user_id
    where rp.season_id = v_cur and rp.season_games > 0
  )
  select
    coalesce((select jsonb_agg(jsonb_build_object(
        'position', r.pos, 'username', r.username, 'rating', r.rating,
        'division', public.ranked_division_id(public.ranked_division(r.rating)),
        'games', r.season_games, 'wins', r.season_wins, 'placement', r.placement_left > 0,
        'is_me', r.user_id = uid) order by r.pos)
      from ranked r where r.pos <= least(greatest(coalesce(p_limit, 50), 1), 100)), '[]'::jsonb),
    (select jsonb_build_object(
        'position', r.pos, 'username', r.username, 'rating', r.rating,
        'division', public.ranked_division_id(public.ranked_division(r.rating)),
        'games', r.season_games, 'wins', r.season_wins, 'placement', r.placement_left > 0, 'is_me', true)
      from ranked r where r.user_id = uid)
  into v_rows, v_me;

  return jsonb_build_object('season_id', v_cur, 'rows', v_rows, 'me', v_me);
end;
$$;

create or replace function public.get_ranked_match(p_tournament uuid)
returns jsonb
language plpgsql stable security definer set search_path to ''
as $$
declare
  uid uuid := (select auth.uid()); rm public.ranked_matches; v_home boolean;
  v_status public.tournament_status; v_hs int; v_as int; v_deadline timestamptz;
begin
  if uid is null then raise exception 'unauthenticated'; end if;
  select * into rm from public.ranked_matches where tournament_id = p_tournament;
  if rm.tournament_id is null then raise exception 'match_not_found'; end if;
  if uid not in (rm.home_user, rm.away_user) then raise exception 'not_participant'; end if;
  v_home := (uid = rm.home_user);

  select t.status, t.round_deadline into v_status, v_deadline from public.tournaments t where t.id = p_tournament;
  select m.home_score, m.away_score into v_hs, v_as from public.matches m where m.tournament_id = p_tournament limit 1;

  return jsonb_build_object(
    'tournament_id', rm.tournament_id,
    'season_id', rm.season_id,
    'status', v_status,
    'starts_at', v_deadline,
    'server_now', now(),
    'settled', rm.settled_at is not null,
    'won', case when rm.winner_user is null then null else rm.winner_user = uid end,
    'my_score', case when v_home then v_hs else v_as end,
    'opp_score', case when v_home then v_as else v_hs end,
    'me', jsonb_build_object(
      'participant_id', case when v_home then rm.home_participant else rm.away_participant end,
      'username', (select username from public.profiles where id = uid),
      'avatar', (select avatar from public.profiles where id = uid),
      'rating', case when v_home then rm.home_rating else rm.away_rating end,
      'stakes', case when v_home then rm.home_stakes else rm.away_stakes end,
      'result', case when v_home then rm.home_result else rm.away_result end),
    'opp', jsonb_build_object(
      'participant_id', case when v_home then rm.away_participant else rm.home_participant end,
      'username', (select username from public.profiles where id = case when v_home then rm.away_user else rm.home_user end),
      'avatar', (select avatar from public.profiles where id = case when v_home then rm.away_user else rm.home_user end),
      'rating', case when v_home then rm.away_rating else rm.home_rating end)
  );
end;
$$;

-- Perfil → Estadísticas: divisiones alcanzadas (con la 1ª temporada en que se logró) + copas por modo.
create or replace function public.get_profile_stats()
returns jsonb
language plpgsql stable security definer set search_path to ''
as $$
declare uid uuid := (select auth.uid()); v_div jsonb; v_cups jsonb; v_ranked jsonb;
begin
  if uid is null then raise exception 'unauthenticated'; end if;

  with peaks as (
    select r.season_id, r.peak_rating as peak, s.starts_at
      from public.ranked_season_results r join public.ranked_seasons s on s.id = r.season_id
      where r.user_id = uid
    union all
    select rp.season_id, rp.season_peak, s.starts_at
      from public.ranked_players rp join public.ranked_seasons s on s.id = rp.season_id
      where rp.user_id = uid and rp.season_games > 0
  )
  select jsonb_agg(jsonb_build_object(
      'id', public.ranked_division_id(d),
      'season_id', (select pk.season_id from peaks pk where public.ranked_division(pk.peak) >= d
                    order by pk.starts_at asc limit 1)) order by d)
    into v_div
    from generate_series(0, 5) d;

  select jsonb_object_agg(gm.id, jsonb_build_object(
      'gold', (select count(*) from public.participants p join public.tournaments t on t.id = p.tournament_id
               where p.user_id = uid and not p.abandoned and t.mode_id = gm.id and p.placement = 1),
      'silver', (select count(*) from public.participants p join public.tournaments t on t.id = p.tournament_id
               where p.user_id = uid and not p.abandoned and t.mode_id = gm.id and p.placement = 2),
      'bronze', (select count(*) from public.participants p join public.tournaments t on t.id = p.tournament_id
               where p.user_id = uid and not p.abandoned and t.mode_id = gm.id
                 and (p.placement in (3, 4) or p.eliminated_phase = 'semis'))))
    into v_cups
    from public.game_modes gm where gm.id <> 'ranked';

  select jsonb_build_object('games', rp.games, 'wins', rp.wins, 'rating', rp.rating)
    into v_ranked from public.ranked_players rp where rp.user_id = uid;

  return jsonb_build_object('divisions', v_div, 'cups', coalesce(v_cups, '{}'::jsonb), 'ranked', v_ranked);
end;
$$;


-- ───────────────────────── 11) Copias con el cambio mínimo marcado ─────────────────────────
-- assign_round_question / progress_match: la dificultad sale de match_penalty_difficulty (ranked = por nivel).
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

  v_diff := public.match_penalty_difficulty(p_match, p_idx);  -- ranked: por nivel
  v_q := public.take_tournament_question(
    v_tournament, v_diff,
    (coalesce(v_seed, 0) # public.engine_hash32(v_phase::text || ':' || coalesce(v_slot, 0) || ':' || p_idx)) & 4294967295
  );
  return v_q;
end;
$$;

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
    v_diff := public.match_penalty_difficulty(p_match, v_idx);  -- ranked: por nivel
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

-- Historial de torneos: sin los ranked.
create or replace function public.get_tournament_history()
returns jsonb
language plpgsql security definer set search_path to ''
as $$
declare uid uuid := (select auth.uid()); v_result jsonb;
begin
  if uid is null then return '[]'::jsonb; end if;

  select coalesce(jsonb_agg(entry order by played_at desc), '[]'::jsonb) into v_result
  from (
    select
      jsonb_build_object(
        'tournamentId', p.tournament_id,
        'modeId', t.mode_id,
        'teamName', coalesce(tm.name, '—'),
        'teamCode', tm.code,
        'teamFlag', tm.flag_asset,
        'teamCrest', tm.crest_asset,
        'kitPrimary', tm.kit_primary,
        'placement', p.placement,
        'eliminatedPhase', p.eliminated_phase,
        'abandoned', p.abandoned,
        'goalsFor', coalesce(agg.goals_for, 0),
        'matchesPlayed', coalesce(agg.played, 0),
        'matchesWon', coalesce(agg.won, 0),
        'playedAt', t.created_at,
        'finalPhase', lm.phase,
        'finalMyScore', lm.my_score,
        'finalOppScore', lm.opp_score,
        'finalOppTeamCode', opt.code,
        'finalOppFlag', opt.flag_asset,
        'finalOppCrest', opt.crest_asset,
        'finalOppKitPrimary', opt.kit_primary,
        'outcome', case
          when p.abandoned then 'abandoned'
          when p.eliminated_phase = 'group' then 'lost'
          when lm.match_id is null then null
          when lm.winner_participant_id = p.id then 'won'
          else 'lost' end
      ) as entry,
      t.created_at as played_at
    from public.participants p
      join public.tournaments t on t.id = p.tournament_id
      left join public.teams tm on tm.id = p.team_id
      left join lateral (
        select count(*) as played,
               count(*) filter (where m.winner_participant_id = p.id) as won,
               coalesce(sum(case when m.home_participant_id = p.id then m.home_score else m.away_score end), 0) as goals_for
        from public.matches m
        where m.status = 'finished' and (m.home_participant_id = p.id or m.away_participant_id = p.id)
      ) agg on true
      left join lateral (
        select mm.id as match_id, mm.phase, mm.winner_participant_id,
               case when mm.home_participant_id = p.id then mm.home_score else mm.away_score end as my_score,
               case when mm.home_participant_id = p.id then mm.away_score else mm.home_score end as opp_score,
               case when mm.home_participant_id = p.id then mm.away_participant_id else mm.home_participant_id end as opp_id
        from public.matches mm
        where mm.status = 'finished' and (mm.home_participant_id = p.id or mm.away_participant_id = p.id)
        order by case mm.phase::text
          when 'group' then 0 when 'round_of_32' then 1 when 'round_of_16' then 2
          when 'quarters' then 3 when 'semis' then 4 when 'third_place' then 5
          when 'final' then 6 else -1 end desc,
          mm.created_at desc
        limit 1
      ) lm on true
      left join public.participants opp on opp.id = lm.opp_id
      left join public.teams opt on opt.id = opp.team_id
    where p.user_id = uid and t.mode_id <> 'ranked'  -- los ranked tienen su propio historial
  ) sub;

  return v_result;
end;
$$;

-- ───────────────────────── 12) Grants (revocar anon explícito) ─────────────────────────
do $$
declare f text;
begin
  foreach f in array array[
    'public.ranked_division(int)', 'public.ranked_division_min(int)', 'public.ranked_division_id(int)',
    'public.ranked_apply_result(int, int, int, int, boolean)', 'public.ranked_difficulty(int, int)',
    'public.ranked_queue_window(float8)', 'public.ranked_season_id(timestamptz)',
    'public.ranked_roll_season(uuid)', 'public.ranked_ensure_player(uuid)',
    'public.ranked_create_match(uuid, uuid)', 'public.ranked_active_tournament(uuid)',
    'public.ranked_try_match(uuid)', 'public.ranked_tick()', 'public.ranked_settle(uuid)',
    'public.ranked_on_tournament_finished()', 'public.ranked_forfeit(uuid, uuid)',
    'public.match_penalty_difficulty(uuid, int)', 'public.take_tournament_question(uuid, public.difficulty, bigint)',
    'public.participant_brief(uuid)', 'public.assign_round_question(uuid, int)', 'public.progress_match(uuid)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
  end loop;
  foreach f in array array[
    'public.ranked_enqueue()', 'public.ranked_poll()', 'public.ranked_cancel()',
    'public.get_ranked_me()', 'public.get_ranking(int)', 'public.get_ranked_match(uuid)',
    'public.get_profile_stats()', 'public.abandon(uuid)', 'public.get_tournament_history()'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

revoke truncate, trigger, references, maintain on table public.ranked_seasons, public.ranked_players,
  public.ranked_season_results, public.ranked_queue, public.ranked_matches from anon, authenticated;

-- Temporada en curso al lanzar.
select public.ranked_roll_season(null);

-- ───────────────────────── 13) pg_cron: matchmaking de respaldo + cierre de temporadas ─────────────────────────
select cron.schedule('tanda-ranked', '2 seconds', $cron$select public.ranked_tick();$cron$);
