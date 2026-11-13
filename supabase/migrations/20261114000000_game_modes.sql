-- ════════════════════════════════════════════════════════════════════════════
-- Tanda 2.0 — Arquitectura de MODOS de juego (escalable).
--
-- Un modo define el catálogo (equipos + preguntas) y el FORMATO del torneo. Las RPC dejan de tener el
-- Mundial hardcodeado (12×4, 48, 8 mejores terceros, 3er puesto) y leen `game_modes`:
--   · worldcup: 48 · 12 zonas de 4 · 3 fechas · 2 por zona + 8 mejores 3ros → 16avos · 3er puesto
--   · arg:      30 ·  2 zonas de 15 · 5 fechas (los libres de cada fecha juegan un INTERZONAL)
--               · 8 por zona → octavos (1A–8B, 2A–7B…) · sin 3er puesto
--               · desempate: puntos → penales convertidos → moneda (seed)
-- Fixture genérico: método del círculo (engine_round_robin, port de lib/engine/formats.ts, paridad).
-- `nations` → `teams` (con mode_id, nombre corto, escudo y patrón de camiseta).
-- ════════════════════════════════════════════════════════════════════════════

-- ───────────────────────── 1) game_modes ─────────────────────────
create table public.game_modes (
  id text primary key,
  name text not null,
  room_size int not null check (room_size between 2 and 64),
  zones int not null check (zones between 1 and 26),
  zone_size int not null check (zone_size >= 2),
  matchdays int not null check (matchdays >= 1),
  qualifiers_per_zone int not null check (qualifiers_per_zone >= 1),
  best_thirds int not null default 0 check (best_thirds >= 0),
  knockout_start public.match_phase not null,
  third_place boolean not null,
  tiebreak text not null check (tiebreak in ('gd_h2h', 'goals')),
  active boolean not null default true,
  sort int not null default 0,
  check (zones * zone_size = room_size)
);
comment on table public.game_modes is 'Modos de juego: formato del torneo + catálogo (teams/questions por mode_id).';

alter table public.game_modes enable row level security;
create policy "game_modes_select_all" on public.game_modes for select to anon, authenticated using (true);
revoke all on table public.game_modes from anon, authenticated;
grant select on table public.game_modes to anon, authenticated;

insert into public.game_modes
  (id, name, room_size, zones, zone_size, matchdays, qualifiers_per_zone, best_thirds, knockout_start, third_place, tiebreak, active, sort)
values
  ('worldcup', 'Mundial', 48, 12, 4, 3, 2, 8, 'round_of_32', true, 'gd_h2h', true, 1),
  ('arg', 'Fútbol argentino', 30, 2, 15, 5, 8, 0, 'round_of_16', false, 'goals', false, 2);
-- `arg` se activa cuando su catálogo (30 equipos + preguntas) está sembrado.

-- ───────────────────────── 2) nations → teams ─────────────────────────
create type public.kit_pattern as enum ('solid', 'vstripes', 'hstripes', 'sash', 'halves', 'hoops', 'band', 'chevron', 'checks');

alter table public.nations rename to teams;
alter table public.teams rename column fifa_rank to strength_rank;
alter table public.teams add column mode_id text not null default 'worldcup' references public.game_modes(id);
alter table public.teams alter column mode_id drop default;
alter table public.teams add column short_name text;
alter table public.teams add column crest_asset text;
alter table public.teams add column kit_pattern public.kit_pattern not null default 'solid';
alter table public.teams add column kit_tertiary text;
update public.teams set short_name = name where short_name is null;
alter table public.teams alter column short_name set not null;
comment on table public.teams is 'Equipos por modo (selecciones del Mundial, clubes argentinos…). Seed generado desde data/teams/.';
comment on column public.teams.strength_rank is '1 = más fuerte. Mundial: orden de clasificados; Argentina: tabla de promedios.';

alter table public.teams drop constraint if exists nations_code_key;
alter table public.teams add constraint teams_mode_code_key unique (mode_id, code);
alter index if exists nations_pkey rename to teams_pkey;
alter policy "nations_select_authenticated" on public.teams rename to "teams_select_authenticated";

alter table public.participants rename column nation_id to team_id;
alter table public.participants rename constraint participants_nation_id_fkey to participants_team_id_fkey;

-- ───────────────────────── 3) mode_id en rooms / tournaments / questions ─────────────────────────
alter table public.rooms add column mode_id text not null default 'worldcup' references public.game_modes(id);
alter table public.tournaments add column mode_id text not null default 'worldcup' references public.game_modes(id);
alter table public.questions add column mode_id text not null default 'worldcup' references public.game_modes(id);
alter table public.rooms alter column mode_id drop default;
alter table public.tournaments alter column mode_id drop default;
alter table public.questions alter column mode_id drop default;

drop index if exists public.questions_difficulty_idx;
create index questions_mode_difficulty_idx on public.questions (mode_id, difficulty);
create index rooms_lobby_mode_idx on public.rooms (mode_id, starts_at) where status = 'lobby';

-- ───────────────────────── 4) motor: fixture por método del círculo ─────────────────────────
-- Port de lib/engine/formats.ts `roundRobin`. Posiciones 1..n; si n es impar se agrega un fantasma
-- (n+1) y quien lo enfrenta queda LIBRE (away_pos = 0). Se fija la 1 y se rota el resto a la derecha;
-- se empareja arr[i] vs arr[m-1-i]. Para n=4 reproduce exacto el fixture histórico del Mundial.
create or replace function public.engine_round_robin(p_n int, p_rounds int)
returns table (md int, home_pos int, away_pos int)
language plpgsql immutable set search_path to ''
as $$
declare
  m int := case when p_n % 2 = 0 then p_n else p_n + 1 end;
  rest int[]; arr int[]; r int; i int; k int; a int; b int;
begin
  for r in 0 .. least(p_rounds, m - 1) - 1 loop
    rest := array(select g from generate_series(2, m) g);
    -- rotación a la derecha r posiciones
    k := r % (m - 1);
    if k > 0 then
      rest := rest[(m - 1) - k + 1 : m - 1] || rest[1 : (m - 1) - k];
    end if;
    arr := array[1] || rest;
    for i in 1 .. m / 2 loop
      a := arr[i]; b := arr[m + 1 - i];
      md := r + 1;
      if a > p_n then home_pos := b; away_pos := 0;
      elsif b > p_n then home_pos := a; away_pos := 0;
      else home_pos := a; away_pos := b; end if;
      return next;
    end loop;
  end loop;
end;
$$;
comment on function public.engine_round_robin(int, int) is 'Port SQL de lib/engine/formats.ts roundRobin. Verificado por paridad.';

-- ───────────────────────── 5) RPC de sala con modo ─────────────────────────
drop function if exists public.create_room();
create or replace function public.create_room(p_mode text default 'worldcup')
returns table (room_id uuid, tournament_id uuid, code text)
language plpgsql security definer set search_path to ''
as $$
declare
  uid uuid := (select auth.uid());
  v_room uuid; v_tournament uuid; v_code text;
begin
  if uid is null then raise exception 'unauthenticated'; end if;
  if not exists (select 1 from public.game_modes gm where gm.id = p_mode and gm.active) then
    raise exception 'invalid_mode';
  end if;
  perform public.enforce_rate_limit('create_room', 10, interval '1 minute');
  v_code := public.gen_room_code();
  insert into public.rooms (code, host_id, status, starts_at, mode_id)
    values (v_code, uid, 'lobby', now() + interval '1 minute', p_mode)
    returning id into v_room;
  insert into public.tournaments (room_id, status, current_phase, seed, mode_id)
    values (v_room, 'pending', 'groups', (random() * 9.2e18)::bigint, p_mode)
    returning id into v_tournament;
  insert into public.participants (tournament_id, user_id, is_bot)
    values (v_tournament, uid, false);
  return query select v_room, v_tournament, v_code;
end;
$$;

drop function if exists public.quick_play();
create or replace function public.quick_play(p_mode text default 'worldcup')
returns table (room_id uuid, tournament_id uuid, code text)
language plpgsql security definer set search_path to ''
as $$
declare
  uid uuid := (select auth.uid());
  v_room uuid; v_tournament uuid; v_code text; v_size int;
begin
  if uid is null then raise exception 'unauthenticated'; end if;
  select gm.room_size into v_size from public.game_modes gm where gm.id = p_mode and gm.active;
  if v_size is null then raise exception 'invalid_mode'; end if;
  perform public.enforce_rate_limit('quick_play', 20, interval '1 minute');

  -- 1) Reanudar: torneo en curso (cualquier modo), o un lobby propio aún abierto.
  select r.id, t.id, r.code into v_room, v_tournament, v_code
    from public.participants p
    join public.tournaments t on t.id = p.tournament_id
    join public.rooms r on r.id = t.room_id
    where p.user_id = uid and p.is_bot = false
      and (r.status = 'in_progress' or (r.status = 'lobby' and r.starts_at > now()))
    order by r.created_at desc
    limit 1;
  if v_room is not null then
    return query select v_room, v_tournament, v_code;
    return;
  end if;

  -- 2) Lobby abierto DEL MODO con más humanos y cupo (FOR UPDATE SKIP LOCKED).
  select r.id, t.id, r.code into v_room, v_tournament, v_code
    from public.rooms r
    join public.tournaments t on t.room_id = r.id
    where r.status = 'lobby' and r.mode_id = p_mode and r.starts_at > now()
      and (select count(*) from public.participants pp where pp.tournament_id = t.id) < v_size
    order by
      (select count(*) from public.participants pp where pp.tournament_id = t.id and pp.is_bot = false) desc,
      r.created_at asc
    limit 1
    for update of r skip locked;
  if v_room is not null then
    if not exists (select 1 from public.participants pq where pq.tournament_id = v_tournament and pq.user_id = uid)
       and (select count(*) from public.participants pp where pp.tournament_id = v_tournament) < v_size
    then
      insert into public.participants (tournament_id, user_id, is_bot) values (v_tournament, uid, false);
    end if;
    return query select v_room, v_tournament, v_code;
    return;
  end if;

  -- 3) Serializar solo la creación (por modo) y volver a buscar antes de crear.
  perform pg_advisory_xact_lock(hashtext('tanda_quick_play_create:' || p_mode));

  select r.id, t.id, r.code into v_room, v_tournament, v_code
    from public.rooms r
    join public.tournaments t on t.room_id = r.id
    where r.status = 'lobby' and r.mode_id = p_mode and r.starts_at > now()
      and (select count(*) from public.participants pp where pp.tournament_id = t.id) < v_size
    order by
      (select count(*) from public.participants pp where pp.tournament_id = t.id and pp.is_bot = false) desc,
      r.created_at asc
    limit 1;
  if v_room is not null then
    if not exists (select 1 from public.participants pq where pq.tournament_id = v_tournament and pq.user_id = uid)
       and (select count(*) from public.participants pp where pp.tournament_id = v_tournament) < v_size
    then
      insert into public.participants (tournament_id, user_id, is_bot) values (v_tournament, uid, false);
    end if;
    return query select v_room, v_tournament, v_code;
    return;
  end if;

  return query select * from public.create_room(p_mode);
end;
$$;

create or replace function public.join_room(p_code text)
returns table (room_id uuid, tournament_id uuid, code text)
language plpgsql security definer set search_path to ''
as $$
declare
  uid uuid := (select auth.uid());
  v_room uuid; v_tournament uuid; v_status public.room_status; v_starts_at timestamptz;
  v_count int; v_size int;
begin
  if uid is null then raise exception 'unauthenticated'; end if;

  select r.id, t.id, r.status, r.starts_at, gm.room_size
    into v_room, v_tournament, v_status, v_starts_at, v_size
    from public.rooms r
    join public.tournaments t on t.room_id = r.id
    join public.game_modes gm on gm.id = r.mode_id
    where r.code = upper(trim(p_code));

  if v_room is null then raise exception 'room_not_found'; end if;
  if v_status = 'cancelled' then raise exception 'room_cancelled'; end if;
  if v_status <> 'lobby' then raise exception 'already_started'; end if;

  if exists (select 1 from public.participants pj where pj.tournament_id = v_tournament and pj.user_id = uid) then
    return query select v_room, v_tournament, upper(trim(p_code));
    return;
  end if;

  if v_starts_at <= now() then raise exception 'room_closed'; end if;

  select count(*) into v_count from public.participants pp where pp.tournament_id = v_tournament;
  if v_count >= v_size then raise exception 'room_full'; end if;

  insert into public.participants (tournament_id, user_id, is_bot) values (v_tournament, uid, false);

  -- Sala llena → arranca ya (sin esperar el countdown).
  if v_count + 1 >= v_size then
    perform public.start_tournament(v_room);
  end if;

  return query select v_room, v_tournament, upper(trim(p_code));
end;
$$;

-- ───────────────────────── 6) start_tournament genérico ─────────────────────────
create or replace function public.start_tournament(p_room uuid)
returns void
language plpgsql security definer set search_path to ''
as $$
declare
  v_tournament uuid; v_seed bigint; v_humans int; v_mode public.game_modes;
  v_letters text[]; v_teams int;
begin
  select t.id, t.seed into v_tournament, v_seed
    from public.tournaments t
    where t.room_id = p_room and t.status = 'pending'
    for update skip locked;
  if v_tournament is null then return; end if;

  select gm.* into v_mode from public.game_modes gm
    join public.tournaments t on t.mode_id = gm.id where t.id = v_tournament;

  select count(*) into v_humans from public.participants where tournament_id = v_tournament and is_bot = false;
  if v_humans = 0 then
    update public.rooms set status = 'cancelled' where id = p_room;
    return;
  end if;

  select count(*) into v_teams from public.teams where mode_id = v_mode.id;
  if v_teams < v_mode.room_size then raise exception 'mode_catalog_incomplete' using detail = v_mode.id; end if;

  update public.rooms set status = 'starting' where id = p_room;

  v_letters := array(select chr(64 + g) from generate_series(1, v_mode.zones) g);

  -- Humanos repartidos round-robin entre zonas (por orden de llegada); bots completan cada zona.
  with h as (
    select id, row_number() over (order by created_at, id) as rn
    from public.participants where tournament_id = v_tournament and is_bot = false
  )
  update public.participants p
    set group_letter = v_letters[((h.rn - 1) % v_mode.zones) + 1]
    from h where p.id = h.id;

  insert into public.participants (tournament_id, user_id, is_bot, group_letter)
  select v_tournament, null, true, g.letter
  from (select unnest(v_letters) as letter) g
  cross join lateral generate_series(
    1,
    v_mode.zone_size - (select count(*) from public.participants
                        where tournament_id = v_tournament and group_letter = g.letter)
  );

  -- Equipos del modo, 1:1 por sorteo (seed). Con room_size equipos exactos, todos juegan.
  with parts as (
    select id, row_number() over (order by md5(v_seed::text || ':' || id::text)) as rn
    from public.participants where tournament_id = v_tournament
  ),
  tms as (
    select id as team_id, row_number() over (order by md5(v_seed::text || ':' || id::text)) as rn
    from public.teams where mode_id = v_mode.id
  )
  update public.participants p
    set team_id = tms.team_id
    from parts join tms on tms.rn = parts.rn
    where p.id = parts.id;

  -- Fixture por zona (método del círculo) sobre posiciones sorteadas (pos 1..zone_size por zona).
  insert into public.matches
    (tournament_id, phase, group_letter, bracket_slot, home_participant_id, away_participant_id, is_bot_only, status)
  with pos as (
    select id, group_letter, is_bot,
           row_number() over (partition by group_letter order by md5(v_seed::text || ':' || id::text))::int as pos
    from public.participants where tournament_id = v_tournament
  )
  select v_tournament, 'group', h.group_letter, rr.md, h.id, a.id, (h.is_bot and a.is_bot), 'pending'
  from public.engine_round_robin(v_mode.zone_size, v_mode.matchdays) rr
  join pos h on h.pos = rr.home_pos
  join pos a on a.pos = rr.away_pos and a.group_letter = h.group_letter
  where rr.away_pos > 0;

  -- Zonas impares: los LIBRES de cada fecha juegan un interzonal (zona 1 vs 2, 3 vs 4…).
  -- group_letter null = interzonal; suma para la tabla de la zona de cada uno.
  if v_mode.zone_size % 2 = 1 then
    insert into public.matches
      (tournament_id, phase, group_letter, bracket_slot, home_participant_id, away_participant_id, is_bot_only, status)
    with pos as (
      select id, group_letter, is_bot,
             row_number() over (partition by group_letter order by md5(v_seed::text || ':' || id::text))::int as pos
      from public.participants where tournament_id = v_tournament
    ),
    byes as (
      select rr.md, p.id, p.is_bot, array_position(v_letters, p.group_letter) as zi
      from public.engine_round_robin(v_mode.zone_size, v_mode.matchdays) rr
      join pos p on p.pos = rr.home_pos
      where rr.away_pos = 0
    )
    select v_tournament, 'group', null, h.md,
           -- alterna la localía por fecha
           case when h.md % 2 = 1 then h.id else a.id end,
           case when h.md % 2 = 1 then a.id else h.id end,
           (h.is_bot and a.is_bot), 'pending'
    from byes h join byes a on a.md = h.md and a.zi = h.zi + 1 and h.zi % 2 = 1;
  end if;

  update public.tournaments set status = 'in_progress', current_phase = 'groups' where id = v_tournament;
  update public.rooms set status = 'in_progress' where id = p_room;

  -- Backstop de presentación (la ventana real la fija begin_presentation al llegar el humano).
  update public.tournaments set round_deadline = now() + interval '10 seconds' where id = v_tournament;
end;
$$;

-- ───────────────────────── 7) Tabla de zona (incluye interzonales) ─────────────────────────
create or replace function public.engine_group_standings(p_tournament uuid, p_group text)
returns table (participant_id uuid, rank int, pts int, gd int, gf int)
language plpgsql stable set search_path to ''
as $$
declare v_seed bigint; v_tiebreak text;
begin
  select t.seed, gm.tiebreak into v_seed, v_tiebreak
    from public.tournaments t join public.game_modes gm on gm.id = t.mode_id
    where t.id = p_tournament;

  return query
  with zone as (
    select pa.id from public.participants pa
    where pa.tournament_id = p_tournament and pa.group_letter = p_group
  ),
  mr as (
    select m.home_participant_id as a, m.away_participant_id as b, m.home_score as hs, m.away_score as as_
    from public.matches m
    where m.tournament_id = p_tournament and m.phase = 'group' and m.status = 'finished'
      and (m.home_participant_id in (select id from zone) or m.away_participant_id in (select id from zone))
  ),
  perteam as (
    select a as team, b as opp, hs as gf_, as_ as ga_ from mr
    union all
    select b as team, a as opp, as_ as gf_, hs as ga_ from mr
  ),
  base as (
    select z.id as team,
      coalesce(sum(p.gf_), 0)::int as gf,
      coalesce(sum(p.gf_ - p.ga_), 0)::int as gd,
      coalesce(sum(case when p.gf_ > p.ga_ then 3 when p.gf_ = p.ga_ then 1 else 0 end), 0)::int as pts
    from zone z left join perteam p on p.team = z.id
    group by z.id
  ),
  ranked as (
    select b.*,
      case when v_tiebreak = 'goals'
        then rank() over (order by b.pts desc, b.gf desc)
        else rank() over (order by b.pts desc, b.gd desc, b.gf desc) end as orank
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
        case when v_tiebreak = 'goals' then 0 else h.hpts end desc,
        case when v_tiebreak = 'goals' then 0 else h.hgd end desc,
        case when v_tiebreak = 'goals' then 0 else h.hgf end desc,
        public.engine_mulberry32((v_seed # public.engine_fnv32(r.team::text)) & 4294967295)))::int,
    r.pts, r.gd, r.gf
  from ranked r join h2h h on h.team = r.team;
end;
$$;

-- ───────────────────────── 8) build_knockout genérico ─────────────────────────
create or replace function public.build_knockout(p_tournament uuid)
returns void
language plpgsql security definer set search_path to ''
as $$
declare
  v_seed bigint; v_mode public.game_modes;
  letter text; rec record;
  q_team uuid[] := '{}'; q_group text[] := '{}'; q_slot int[] := '{}';
  t_team uuid[] := '{}'; t_group text[] := '{}';
  t_pts int[] := '{}'; t_gd int[] := '{}'; t_gf int[] := '{}';
  k int;
  win_team uuid[]; win_group text[]; pool_team uuid[]; pool_group text[];
  m_home uuid[] := '{}'; m_away uuid[] := '{}';
  i int; j int; a_team uuid; a_group text;
  za uuid[]; zb uuid[]; n int; seeds int[];
begin
  select gm.* into v_mode from public.game_modes gm
    join public.tournaments t on t.mode_id = gm.id where t.id = p_tournament;

  if exists (select 1 from public.matches
             where tournament_id = p_tournament and phase = v_mode.knockout_start) then
    return;  -- idempotente
  end if;

  select seed into v_seed from public.tournaments where id = p_tournament;

  if v_mode.best_thirds = 0 then
    -- ── Cruce por zonas (Argentina: 2 zonas, N por zona) ──
    -- 1A–NB, …: el mejor de una zona contra el peor clasificado de la otra. Orden de bracket con
    -- siembra estándar para que 1A y 1B recién se puedan cruzar en la final.
    if v_mode.zones <> 2 then raise exception 'unsupported_format' using detail = 'zones<>2 sin best_thirds'; end if;
    n := v_mode.qualifiers_per_zone;
    za := array(select s.participant_id from public.engine_group_standings(p_tournament, 'A') s
                where s.rank <= n order by s.rank);
    zb := array(select s.participant_id from public.engine_group_standings(p_tournament, 'B') s
                where s.rank <= n order by s.rank);
    update public.participants set eliminated_phase = 'group'
      where tournament_id = p_tournament and group_letter in ('A', 'B')
        and id <> all (za) and id <> all (zb);

    -- Orden de siembra del lado de cada zona: n=8 → 1,4,2,3 (1v8, 4v5, 2v7, 3v6).
    seeds := array(select x from public.engine_seed_order(n / 2) x);
    foreach i in array seeds loop
      m_home := m_home || za[i]; m_away := m_away || zb[n + 1 - i];
    end loop;
    foreach i in array seeds loop
      m_home := m_home || zb[i]; m_away := m_away || za[n + 1 - i];
    end loop;
  else
    -- ── Mundial: 1º/2º de cada zona + mejores terceros ──
    for letter in
      select distinct group_letter from public.participants
      where tournament_id = p_tournament and group_letter is not null order by 1
    loop
      for rec in select * from public.engine_group_standings(p_tournament, letter) loop
        if rec.rank <= v_mode.qualifiers_per_zone then
          q_team := q_team || rec.participant_id; q_group := q_group || letter; q_slot := q_slot || rec.rank;
        elsif rec.rank = v_mode.qualifiers_per_zone + 1 then
          t_team := t_team || rec.participant_id; t_group := t_group || letter;
          t_pts := t_pts || rec.pts; t_gd := t_gd || rec.gd; t_gf := t_gf || rec.gf;
        else
          update public.participants set eliminated_phase = 'group' where id = rec.participant_id;
        end if;
      end loop;
    end loop;

    k := 0;
    for rec in
      select team, grp from unnest(t_team, t_group, t_pts, t_gd, t_gf) as u(team, grp, pts, gd, gf)
      order by pts desc, gd desc, gf desc,
        public.engine_mulberry32((v_seed # public.engine_fnv32(team::text)) & 4294967295)
    loop
      k := k + 1;
      if k <= v_mode.best_thirds then
        q_team := q_team || rec.team; q_group := q_group || rec.grp; q_slot := q_slot || 3;
      else
        update public.participants set eliminated_phase = 'group' where id = rec.team;
      end if;
    end loop;

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

    for i in 1 .. coalesce(array_length(win_team, 1), 0) loop
      j := coalesce((select min(idx) from generate_subscripts(pool_group, 1) idx where pool_group[idx] <> win_group[i]), 1);
      m_home := m_home || win_team[i]; m_away := m_away || pool_team[j];
      pool_team  := pool_team[1:j-1]  || pool_team[j+1:];
      pool_group := pool_group[1:j-1] || pool_group[j+1:];
    end loop;

    while coalesce(array_length(pool_team, 1), 0) > 0 loop
      a_team := pool_team[1]; a_group := pool_group[1];
      pool_team := pool_team[2:]; pool_group := pool_group[2:];
      j := coalesce((select min(idx) from generate_subscripts(pool_group, 1) idx where pool_group[idx] <> a_group), 1);
      m_home := m_home || a_team; m_away := m_away || pool_team[j];
      pool_team  := pool_team[1:j-1]  || pool_team[j+1:];
      pool_group := pool_group[1:j-1] || pool_group[j+1:];
    end loop;
  end if;

  insert into public.matches
    (tournament_id, phase, bracket_slot, home_participant_id, away_participant_id, is_bot_only, status)
  select p_tournament, v_mode.knockout_start, g.gi - 1, m_home[g.gi], m_away[g.gi],
    ((select is_bot from public.participants where id = m_home[g.gi])
       and (select is_bot from public.participants where id = m_away[g.gi])),
    'pending'
  from generate_series(1, coalesce(array_length(m_home, 1), 0)) as g(gi);

  update public.tournaments set current_phase = v_mode.knockout_start::text::public.tournament_phase
    where id = p_tournament;
end;
$$;

-- Orden de siembra estándar de un cuadro de 2^k lugares: 1 → [1]; 2 → [1,2]; 4 → [1,4,2,3]; 8 → [1,8,4,5,2,7,3,6].
-- Port de lib/engine/formats.ts seedOrder.
create or replace function public.engine_seed_order(p_n int)
returns setof int
language plpgsql immutable set search_path to ''
as $$
declare cur int[] := array[1]; nxt int[]; x int; sz int := 1;
begin
  while sz < p_n loop
    sz := sz * 2; nxt := '{}';
    foreach x in array cur loop
      nxt := nxt || x || (sz + 1 - x);
    end loop;
    cur := nxt;
  end loop;
  return query select unnest(cur);
end;
$$;

-- ───────────────────────── 9) advance_ko_round: 3er puesto opcional ─────────────────────────
create or replace function public.advance_ko_round(p_tournament uuid)
returns void
language plpgsql security definer set search_path to ''
as $$
declare
  v_phase public.tournament_phase; v_cur public.match_phase; v_next public.tournament_phase;
  v_next_match public.match_phase; v_room uuid; v_third_place boolean;
  v_champ uuid; v_runner uuid; v_third uuid; v_fourth uuid;
begin
  select t.current_phase, gm.third_place into v_phase, v_third_place
    from public.tournaments t join public.game_modes gm on gm.id = t.mode_id
    where t.id = p_tournament and t.status = 'in_progress';
  if v_phase is null then return; end if;

  if v_phase = 'final' then
    if exists (select 1 from public.matches
               where tournament_id = p_tournament and phase in ('final', 'third_place') and status <> 'finished') then
      return;
    end if;

    select winner_participant_id,
           case when winner_participant_id = home_participant_id then away_participant_id else home_participant_id end
      into v_champ, v_runner
      from public.matches where tournament_id = p_tournament and phase = 'final';
    update public.participants set placement = 1 where id = v_champ;
    update public.participants set placement = 2, eliminated_phase = 'final' where id = v_runner;

    if v_third_place then
      select winner_participant_id,
             case when winner_participant_id = home_participant_id then away_participant_id else home_participant_id end
        into v_third, v_fourth
        from public.matches where tournament_id = p_tournament and phase = 'third_place';
      update public.participants set placement = 3 where id = v_third;
      update public.participants set placement = 4, eliminated_phase = 'third_place' where id = v_fourth;
    end if;

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

  if not exists (select 1 from public.matches where tournament_id = p_tournament and phase = v_next_match) then
    insert into public.matches
      (tournament_id, phase, bracket_slot, home_participant_id, away_participant_id, is_bot_only, status)
    with w as (
      select winner_participant_id as wid, row_number() over (order by bracket_slot) - 1 as ord
      from public.matches
      where tournament_id = p_tournament and phase = v_cur and status = 'finished'
    )
    select p_tournament, v_next_match, (h.ord / 2)::int, h.wid, a.wid,
      ((select is_bot from public.participants where id = h.wid)
         and (select is_bot from public.participants where id = a.wid)),
      'pending'
    from w h join w a on a.ord = h.ord + 1 and h.ord % 2 = 0;

    if v_phase = 'semis' and v_third_place then
      -- semis → 3er puesto con los perdedores (juegan otra vez; no se marcan eliminados).
      insert into public.matches
        (tournament_id, phase, bracket_slot, home_participant_id, away_participant_id, is_bot_only, status)
      with l as (
        select case when winner_participant_id = home_participant_id then away_participant_id else home_participant_id end as lid,
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
      update public.participants set eliminated_phase = v_cur
      where id in (
        select case when winner_participant_id = home_participant_id then away_participant_id else home_participant_id end
        from public.matches
        where tournament_id = p_tournament and phase = v_cur and status = 'finished'
      );
    end if;
  end if;

  update public.tournaments set current_phase = v_next where id = p_tournament and current_phase = v_phase;
end;
$$;

-- ───────────────────────── 10) Preguntas por modo ─────────────────────────
create or replace function public.take_tournament_question(p_tournament uuid, p_difficulty public.difficulty, p_seed bigint)
returns uuid
language plpgsql security definer set search_path to ''
as $$
declare
  v_question uuid; v_order public.difficulty[]; v_diff public.difficulty; v_mode text;
begin
  select mode_id into v_mode from public.tournaments where id = p_tournament;

  v_order := case p_difficulty
    when 'easy'      then array['easy','medium','hard','very_hard']::public.difficulty[]
    when 'medium'    then array['medium','easy','hard','very_hard']::public.difficulty[]
    when 'hard'      then array['hard','very_hard','medium','easy']::public.difficulty[]
    when 'very_hard' then array['very_hard','hard','medium','easy']::public.difficulty[]
  end;

  foreach v_diff in array v_order loop
    select q.id into v_question
    from public.questions q
    where q.mode_id = v_mode and q.difficulty = v_diff
      and not exists (select 1 from public.tournament_questions tq
                      where tq.tournament_id = p_tournament and tq.question_id = q.id)
    order by md5(p_seed::text || ':' || q.id::text)
    limit 1;
    exit when v_question is not null;
  end loop;

  if v_question is null then
    select q.id into v_question from public.questions q
    where q.mode_id = v_mode and q.difficulty = p_difficulty
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

-- ───────────────────────── 11) Lecturas: teams en vez de nations ─────────────────────────
create or replace function public.participant_brief(p_part uuid)
returns jsonb
language sql stable security definer set search_path to ''
as $$
  select jsonb_build_object(
    'participant_id', p.id,
    'user_id', p.user_id,
    'is_bot', p.is_bot,
    'team_id', p.team_id,
    'team_code', tm.code,
    'team_name', tm.name,
    'team_short', tm.short_name,
    'flag', tm.flag_asset,
    'crest', tm.crest_asset,
    'kit_primary', tm.kit_primary,
    'kit_secondary', tm.kit_secondary,
    'kit_tertiary', tm.kit_tertiary,
    'kit_pattern', tm.kit_pattern,
    'accent', tm.accent_color
  )
  from public.participants p
  left join public.teams tm on tm.id = p.team_id
  where p.id = p_part;
$$;

create or replace function public.precompute_bot_intents(p_penalty uuid)
returns void
language plpgsql security definer set search_path to ''
as $$
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
    into v_match, v_idx, v_status, v_started, v_deadline, v_question, v_kicker, v_keeper, v_removed
    from public.penalties where id = p_penalty;
  if v_match is null or v_status not in ('open', 'second_chance') then return; end if;
  v_phase := case v_status when 'second_chance' then 'second_chance' else 'first' end;

  select t.seed into v_t_seed
    from public.matches m join public.tournaments t on t.id = m.tournament_id where m.id = v_match;
  v_seed := (coalesce(v_t_seed, 0) # public.engine_hash32(v_match::text || ':' || v_idx)) & mask;
  select correct_index into v_correct from public.questions where id = v_question;

  foreach v_part in array array[v_kicker, v_keeper] loop
    select p.is_bot, tm.difficulty_tier into v_is_bot, v_tier
      from public.participants p left join public.teams tm on tm.id = p.team_id
      where p.id = v_part;
    if not coalesce(v_is_bot, false) then continue; end if;
    v_tier := coalesce(v_tier, 'medium');

    v_seedp := (v_seed # public.engine_hash32(v_part::text || ':' || v_phase::text)) & mask;
    select will_be_correct, delay_ms into v_wc, v_delay from public.engine_bot_intent(v_tier, v_seedp);

    if v_wc then
      v_chosen := v_correct;
    else
      select array_agg(i order by i) into v_wrong from generate_series(0, 2) i
        where i <> v_correct and (v_removed is null or i <> v_removed);
      v_chosen := v_wrong[public.engine_rand_int((v_seedp # wrong_salt) & mask, array_length(v_wrong, 1)) + 1];
    end if;

    v_sched := least(v_started + (v_delay::text || ' milliseconds')::interval, v_deadline);

    insert into public.bot_intents
        (penalty_id, participant_id, phase, scheduled_answer_at, will_be_correct, chosen_option, materialized)
      values (p_penalty, v_part, v_phase, v_sched, v_wc, v_chosen, false)
      on conflict (penalty_id, participant_id, phase) do nothing;
  end loop;
end;
$$;

create or replace function public.simulate_bot_match(p_match uuid)
returns void
language plpgsql security definer set search_path to ''
as $$
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
  if v_status = 'finished' then return; end if;
  if v_home is null or v_away is null then raise exception 'match_incomplete'; end if;

  v_kind := case when v_phase = 'group' then 'group' else 'elimination' end;
  select coalesce(difficulty_tier, 'medium') into v_home_tier
    from public.participants p left join public.teams tm on tm.id = p.team_id where p.id = v_home;
  select coalesce(difficulty_tier, 'medium') into v_away_tier
    from public.participants p left join public.teams tm on tm.id = p.team_id where p.id = v_away;

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
    exit when array_length(v_scored, 1) > 60;
  end loop;

  update public.matches
    set home_score = st.home, away_score = st.away, status = 'finished',
        winner_participant_id = case st.winner when 'home' then v_home when 'away' then v_away else null end
    where id = p_match;

  perform public.emit_score_live(p_match);
end;
$$;

create or replace function public.get_active_tournament()
returns jsonb
language plpgsql security definer set search_path to ''
as $$
declare uid uuid := (select auth.uid()); v_tournament uuid; v_part uuid; v_mode text;
begin
  if uid is null then raise exception 'unauthenticated'; end if;
  select t.id, p.id, t.mode_id into v_tournament, v_part, v_mode
    from public.tournaments t
    join public.participants p on p.tournament_id = t.id
    where p.user_id = uid and p.is_bot = false and t.status = 'in_progress'
      and p.eliminated_phase is null and p.placement is null
    order by t.created_at desc
    limit 1;
  if v_tournament is null then return null; end if;
  return jsonb_build_object('tournament_id', v_tournament, 'my_participant_id', v_part, 'mode_id', v_mode);
end;
$$;

create or replace function public.get_bracket(p_tournament uuid)
returns jsonb
language plpgsql security definer set search_path to ''
as $$
declare uid uuid := (select auth.uid()); v_my uuid; t record;
begin
  if uid is null then raise exception 'unauthenticated'; end if;
  if not public.is_tournament_member(p_tournament) then raise exception 'not_tournament_member'; end if;

  select id into v_my from public.participants
    where tournament_id = p_tournament and user_id = uid and is_bot = false limit 1;
  select tt.current_phase, tt.round_deadline, tt.champion_participant_id, tt.mode_id,
         gm.qualifiers_per_zone, gm.best_thirds, gm.knockout_start, gm.third_place, gm.tiebreak
    into t
    from public.tournaments tt join public.game_modes gm on gm.id = tt.mode_id
    where tt.id = p_tournament;

  return jsonb_build_object(
    'tournament_id', p_tournament,
    'mode_id', t.mode_id,
    'format', jsonb_build_object(
      'qualifiers_per_zone', t.qualifiers_per_zone, 'best_thirds', t.best_thirds,
      'knockout_start', t.knockout_start, 'third_place', t.third_place, 'tiebreak', t.tiebreak),
    'my_participant_id', v_my,
    'current_phase', t.current_phase,
    'round_deadline', t.round_deadline,
    'champion_participant_id', t.champion_participant_id,
    'participants', (
      select coalesce(jsonb_agg(
        public.participant_brief(p.id)
        || jsonb_build_object('group_letter', p.group_letter, 'placement', p.placement,
                              'eliminated_phase', p.eliminated_phase)
        order by p.group_letter, p.id
      ), '[]'::jsonb)
      from public.participants p where p.tournament_id = p_tournament
    ),
    'matches', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'match_id', m.id, 'phase', m.phase, 'group_letter', m.group_letter,
        'bracket_slot', m.bracket_slot, 'status', m.status,
        'home_score', m.home_score, 'away_score', m.away_score,
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
    where p.user_id = uid
  ) sub;

  return v_result;
end;
$$;

-- ───────────────────────── 12) Grants (default privileges dan EXECUTE a anon: revocar explícito) ─────────────────────────
revoke all on function public.engine_round_robin(int, int) from public, anon, authenticated;
revoke all on function public.engine_seed_order(int) from public, anon, authenticated;
revoke all on function public.create_room(text) from public, anon;
grant execute on function public.create_room(text) to authenticated;
revoke all on function public.quick_play(text) from public, anon;
grant execute on function public.quick_play(text) to authenticated;
revoke all on function public.join_room(text) from public, anon;
grant execute on function public.join_room(text) to authenticated;
revoke all on function public.get_active_tournament() from public, anon;
grant execute on function public.get_active_tournament() to authenticated;
revoke all on function public.get_bracket(uuid) from public, anon;
grant execute on function public.get_bracket(uuid) to authenticated;
revoke all on function public.get_tournament_history() from public, anon;
grant execute on function public.get_tournament_history() to authenticated;
revoke all on function public.start_tournament(uuid) from public, anon, authenticated;
revoke all on function public.build_knockout(uuid) from public, anon, authenticated;
revoke all on function public.advance_ko_round(uuid) from public, anon, authenticated;
revoke all on function public.take_tournament_question(uuid, public.difficulty, bigint) from public, anon, authenticated;
revoke all on function public.participant_brief(uuid) from public, anon, authenticated;
revoke all on function public.precompute_bot_intents(uuid) from public, anon, authenticated;
revoke all on function public.simulate_bot_match(uuid) from public, anon, authenticated;
revoke all on function public.engine_group_standings(uuid, text) from public, anon, authenticated;

-- ───────────────────────── 13) Defensa en profundidad: privilegios de tabla ─────────────────────────
-- RLS no cubre TRUNCATE/TRIGGER/REFERENCES/MAINTAIN. El cliente nunca los necesita (PostgREST no los
-- expone, pero no dependemos de eso).
do $$
declare r record;
begin
  for r in select tablename from pg_tables where schemaname = 'public' loop
    execute format('revoke truncate, trigger, references, maintain on table public.%I from anon, authenticated', r.tablename);
  end loop;
end $$;
