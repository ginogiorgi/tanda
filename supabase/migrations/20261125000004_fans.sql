-- ════════════════════════════════════════════════════════════════════════════
-- Feedback 3 #15 — Ranking de hinchas.
--
--  * `profiles.fav_club_id` (club del modo `arg`) y `profiles.fav_nation_id` (selección del `worldcup`).
--    El modo se garantiza con una FK COMPUESTA (id, mode_id) contra `teams` + columna de modo constante
--    → nada de CHECK con funciones (lección: el CHECK corre con los permisos del que escribe).
--  * `fan_counts(team_id, fans)`: contador agregado mantenido por trigger en profiles (alta, cambio,
--    baja). El ranking lee 78 filas; nunca hay COUNT sobre profiles en caliente.
--  * `set_favorites(p_club, p_nation)` (códigos): solo cuentas registradas; sin límite (cambio inmediato).
--  * `get_fan_ranking()`: los dos rankings + tus favoritos. Lo ve cualquiera (también sin sesión).
--  * `handle_new_user`: el alta (registro) trae los favoritos en la metadata (`fav_club`, `fav_nation`).
--  * `start_tournament`: prioridad de favorito por sala (sorteo por seed entre los que lo comparten; a los
--    que pierden y a los invitados, un equipo que NADIE de la sala tenga de favorito; los bots, el resto).
--  * `lobby_favorite(p_mode)`: el favorito del modo para mostrarlo en la sala de espera.
-- ════════════════════════════════════════════════════════════════════════════

-- ───────────────────────── 1) Favoritos en el perfil ─────────────────────────
alter table public.teams add constraint teams_id_mode_key unique (id, mode_id);

alter table public.profiles
  add column if not exists fav_club_id uuid,
  add column if not exists fav_club_mode text not null default 'arg' check (fav_club_mode = 'arg'),
  add column if not exists fav_nation_id uuid,
  add column if not exists fav_nation_mode text not null default 'worldcup' check (fav_nation_mode = 'worldcup');

alter table public.profiles
  add constraint profiles_fav_club_fk foreign key (fav_club_id, fav_club_mode)
    references public.teams (id, mode_id) on delete set null (fav_club_id),
  add constraint profiles_fav_nation_fk foreign key (fav_nation_id, fav_nation_mode)
    references public.teams (id, mode_id) on delete set null (fav_nation_id);

comment on column public.profiles.fav_club_id is 'Club favorito (modo arg). Ranking de hinchas + prioridad en salas de Argentino.';
comment on column public.profiles.fav_nation_id is 'Selección favorita (modo worldcup). Ranking de hinchas + prioridad en salas del Mundial.';

-- ───────────────────────── 2) Contador agregado ─────────────────────────
create table if not exists public.fan_counts (
  team_id uuid primary key references public.teams (id) on delete cascade,
  fans integer not null default 0 check (fans >= 0)
);
alter table public.fan_counts enable row level security;
revoke all on table public.fan_counts from public, anon, authenticated;
comment on table public.fan_counts is 'Hinchas por equipo (feedback 3 #15). Lo mantiene el trigger profiles_fan_counts; se lee por get_fan_ranking.';

create or replace function public.fan_count_bump(p_team uuid, p_delta int)
returns void
language sql security definer set search_path to ''
as $$
  insert into public.fan_counts as fc (team_id, fans) values (p_team, greatest(p_delta, 0))
  on conflict (team_id) do update set fans = greatest(fc.fans + p_delta, 0);
$$;
revoke all on function public.fan_count_bump(uuid, int) from public, anon, authenticated;

-- SECURITY DEFINER: el trigger corre con los permisos del que escribe (el cliente no toca fan_counts).
create or replace function public.profiles_fan_counts()
returns trigger
language plpgsql security definer set search_path to ''
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    if old.fav_club_id is not null and (tg_op = 'DELETE' or old.fav_club_id is distinct from new.fav_club_id) then
      perform public.fan_count_bump(old.fav_club_id, -1);
    end if;
    if old.fav_nation_id is not null and (tg_op = 'DELETE' or old.fav_nation_id is distinct from new.fav_nation_id) then
      perform public.fan_count_bump(old.fav_nation_id, -1);
    end if;
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    if new.fav_club_id is not null and (tg_op = 'INSERT' or old.fav_club_id is distinct from new.fav_club_id) then
      perform public.fan_count_bump(new.fav_club_id, 1);
    end if;
    if new.fav_nation_id is not null and (tg_op = 'INSERT' or old.fav_nation_id is distinct from new.fav_nation_id) then
      perform public.fan_count_bump(new.fav_nation_id, 1);
    end if;
  end if;
  return null;
end;
$$;
revoke all on function public.profiles_fan_counts() from public, anon, authenticated;

drop trigger if exists profiles_fan_counts on public.profiles;
create trigger profiles_fan_counts
  after insert or delete or update of fav_club_id, fav_nation_id on public.profiles
  for each row execute function public.profiles_fan_counts();

-- Punto de partida exacto (en prod no hay favoritos todavía: queda en 0).
insert into public.fan_counts (team_id, fans)
select t.id, count(p.id)::int
from public.teams t
left join public.profiles p on p.fav_club_id = t.id or p.fav_nation_id = t.id
where t.mode_id in ('arg', 'worldcup')
group by t.id
on conflict (team_id) do update set fans = excluded.fans;

-- ───────────────────────── 3) Elegir favoritos ─────────────────────────
create or replace function public.set_favorites(p_club text, p_nation text)
returns jsonb
language plpgsql security definer set search_path to ''
as $$
declare
  uid uuid := (select auth.uid());
  v_club uuid; v_nation uuid;
begin
  if uid is null then raise exception 'unauthenticated'; end if;
  if coalesce((select u.is_anonymous from auth.users u where u.id = uid), true) then
    raise exception 'registered_only';
  end if;
  select id into v_club from public.teams where mode_id = 'arg' and code = p_club;
  select id into v_nation from public.teams where mode_id = 'worldcup' and code = p_nation;
  if v_club is null or v_nation is null then raise exception 'invalid_favorite'; end if;

  update public.profiles set fav_club_id = v_club, fav_nation_id = v_nation, updated_at = now()
    where id = uid
      and (fav_club_id is distinct from v_club or fav_nation_id is distinct from v_nation);
  return jsonb_build_object('club', p_club, 'nation', p_nation);
end;
$$;
revoke all on function public.set_favorites(text, text) from public, anon;
grant execute on function public.set_favorites(text, text) to authenticated;

-- ───────────────────────── 4) Ranking ─────────────────────────
create or replace function public.get_fan_ranking()
returns jsonb
language sql stable security definer set search_path to ''
as $$
  with ranked as (
    select t.mode_id, t.code, t.name, t.short_name, t.flag_asset, t.crest_asset,
           coalesce(fc.fans, 0) as fans,
           rank() over (partition by t.mode_id order by coalesce(fc.fans, 0) desc) as pos
    from public.teams t
    left join public.fan_counts fc on fc.team_id = t.id
    where t.mode_id in ('arg', 'worldcup')
  ),
  me as (
    select c.code as club, n.code as nation
    from public.profiles p
    left join public.teams c on c.id = p.fav_club_id
    left join public.teams n on n.id = p.fav_nation_id
    where p.id = (select auth.uid())
  )
  select jsonb_build_object(
    'clubs', coalesce((select jsonb_agg(jsonb_build_object(
        'code', code, 'name', name, 'short', short_name, 'crest', crest_asset, 'flag', flag_asset,
        'fans', fans, 'pos', pos) order by fans desc, name)
      from ranked where mode_id = 'arg'), '[]'::jsonb),
    'nations', coalesce((select jsonb_agg(jsonb_build_object(
        'code', code, 'name', name, 'short', short_name, 'crest', crest_asset, 'flag', flag_asset,
        'fans', fans, 'pos', pos) order by fans desc, name)
      from ranked where mode_id = 'worldcup'), '[]'::jsonb),
    'mine', (select jsonb_build_object('club', club, 'nation', nation) from me)
  );
$$;
revoke all on function public.get_fan_ranking() from public;
grant execute on function public.get_fan_ranking() to anon, authenticated;

-- ───────────────────────── 5) Alta con favoritos ─────────────────────────
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path to ''
as $$
begin
  insert into public.profiles (id, username, avatar, fav_club_id, fav_nation_id)
  values (
    new.id,
    new.raw_user_meta_data ->> 'username',
    public.avatar_to_v2(new.raw_user_meta_data -> 'avatar'),
    case when not coalesce(new.is_anonymous, false) then
      (select id from public.teams where mode_id = 'arg' and code = new.raw_user_meta_data ->> 'fav_club') end,
    case when not coalesce(new.is_anonymous, false) then
      (select id from public.teams where mode_id = 'worldcup' and code = new.raw_user_meta_data ->> 'fav_nation') end
  );
  return new;
end;
$$;

-- ───────────────────────── 6) Favorito en la sala ─────────────────────────
-- El favorito del usuario para el modo de la sala (null en ranked / sin favorito / invitado).
create or replace function public.lobby_favorite(p_mode text)
returns jsonb
language sql stable security definer set search_path to ''
as $$
  select jsonb_build_object('code', t.code, 'name', t.name, 'flag', t.flag_asset, 'crest', t.crest_asset)
  from public.profiles p
  join public.teams t on t.id = case p_mode when 'arg' then p.fav_club_id when 'worldcup' then p.fav_nation_id end
  where p.id = (select auth.uid());
$$;
revoke all on function public.lobby_favorite(text) from public, anon;
grant execute on function public.lobby_favorite(text) to authenticated;

-- ───────────────────────── 7) Asignación con prioridad de favorito ─────────────────────────
CREATE OR REPLACE FUNCTION public.start_tournament(p_room uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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

  -- Equipos (feedback 3 #15). 1) Cada favorito del modo va a UNO de los humanos registrados que lo eligieron
  -- (sorteo por seed si lo comparten).
  with fav as (
    select p.id, t.id as team_id,
           row_number() over (partition by t.id order by md5(v_seed::text || ':fav:' || p.id::text)) as rn
    from public.participants p
    join auth.users u on u.id = p.user_id and not coalesce(u.is_anonymous, false)
    join public.profiles pr on pr.id = p.user_id
    join public.teams t on t.mode_id = v_mode.id
      and t.id = case v_mode.id when 'arg' then pr.fav_club_id when 'worldcup' then pr.fav_nation_id end
    where p.tournament_id = v_tournament and p.is_bot = false
  )
  update public.participants p set team_id = fav.team_id
    from fav where p.id = fav.id and fav.rn = 1;

  -- 2) Los humanos sin equipo (perdieron el sorteo, sin favorito, invitados): un equipo que NADIE de la sala
  -- tenga de favorito.
  with room_favs as (
    select distinct case v_mode.id when 'arg' then pr.fav_club_id when 'worldcup' then pr.fav_nation_id end as team_id
    from public.participants p
    join auth.users u on u.id = p.user_id and not coalesce(u.is_anonymous, false)
    join public.profiles pr on pr.id = p.user_id
    where p.tournament_id = v_tournament and p.is_bot = false
  ),
  parts as (
    select id, row_number() over (order by md5(v_seed::text || ':' || id::text)) as rn
    from public.participants
    where tournament_id = v_tournament and is_bot = false and team_id is null
  ),
  tms as (
    select t.id as team_id, row_number() over (order by md5(v_seed::text || ':' || t.id::text)) as rn
    from public.teams t
    where t.mode_id = v_mode.id
      and not exists (select 1 from room_favs f where f.team_id = t.id)
      and not exists (select 1 from public.participants q where q.tournament_id = v_tournament and q.team_id = t.id)
  )
  update public.participants p set team_id = tms.team_id
    from parts join tms on tms.rn = parts.rn
    where p.id = parts.id;

  -- 3) El resto (bots, y cualquier humano si no alcanzara lo anterior): los equipos libres, por sorteo.
  with parts as (
    select id, row_number() over (order by is_bot, md5(v_seed::text || ':' || id::text)) as rn
    from public.participants where tournament_id = v_tournament and team_id is null
  ),
  tms as (
    select t.id as team_id, row_number() over (order by md5(v_seed::text || ':' || t.id::text)) as rn
    from public.teams t
    where t.mode_id = v_mode.id
      and not exists (select 1 from public.participants q where q.tournament_id = v_tournament and q.team_id = t.id)
  )
  update public.participants p set team_id = tms.team_id
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
  update public.tournaments set round_deadline = now() + make_interval(secs => (public.game_timing()->>'presentationBackstopS')::int) where id = v_tournament;
end;
$function$
;
