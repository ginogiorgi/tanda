-- Premios del perfil (feedback de Gino 14/11: "el perfil muestra 3 logros del Clausura 2026 y ni terminó").
--
-- Causa: `get_profile_stats` DERIVABA los logros al leer, desde estado en vivo:
--  · divisiones: toda división ≤ al pico de la temporada EN CURSO contaba como "alcanzada" (arrancar en
--    1500 ya daba Potrero + Barrio + Ascenso);
--  · copas: contaba participantes sin mirar si el torneo terminó, y el bronce salía de
--    `eliminated_phase = 'semis'`, que se escribe DURANTE el torneo.
--
-- Cambio: `awards` es el registro único de premios. UN premio por competencia, por construcción
-- (`unique (user_id, competition_kind, competition_id)`), y se escribe solo cuando la competencia TERMINÓ:
--  · torneo → al pasar a `finished` (constraint trigger diferido: ve las posiciones finales al commit, sin
--    importar desde qué RPC ni en qué orden se escribieron). Oro = 1º, plata = 2º, bronce = 3º/4º o
--    eliminado en semis. Solo humanos que no abandonaron; ranked no da copas.
--  · temporada ranked → al cerrarse (`ranked_season_results`, que escribe `ranked_roll_season`): la
--    división FINAL de la temporada.
-- `get_profile_stats` lee SOLO `awards`; la temporada en curso va aparte (`current`), no como premio.
-- Aditiva e idempotente (backfill con `on conflict do nothing`).

create table if not exists public.awards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  competition_kind text not null check (competition_kind in ('tournament', 'ranked_season')),
  competition_id text not null,
  mode_id text not null references public.game_modes(id),
  award text not null check (award in ('gold', 'silver', 'bronze',
    'potrero', 'barrio', 'ascenso', 'primera', 'libertadores', 'leyenda')),
  awarded_at timestamptz not null default now(),
  unique (user_id, competition_kind, competition_id)
);
comment on table public.awards is
  'Premios del perfil: uno por (usuario, competencia), escrito solo al terminar la competencia.';
create index if not exists awards_mode_idx on public.awards (mode_id);

alter table public.awards enable row level security;
revoke all on table public.awards from anon, authenticated;

-- Premio de un torneo terminado para sus humanos (idempotente).
create or replace function public.award_tournament(p_tournament uuid)
returns void
language plpgsql security definer set search_path to ''
as $$
begin
  insert into public.awards (user_id, competition_kind, competition_id, mode_id, award)
  select distinct on (p.user_id)
         p.user_id, 'tournament', t.id::text, t.mode_id,
         case when p.placement = 1 then 'gold' when p.placement = 2 then 'silver' else 'bronze' end
    from public.tournaments t
    join public.participants p on p.tournament_id = t.id
   where t.id = p_tournament
     and t.status = 'finished'
     and t.mode_id <> 'ranked'
     and p.user_id is not null and not p.is_bot and not p.abandoned
     and (p.placement between 1 and 4 or p.eliminated_phase = 'semis')
   order by p.user_id, coalesce(p.placement, 4) asc
  on conflict (user_id, competition_kind, competition_id) do nothing;
end;
$$;

create or replace function public.awards_on_tournament_finished()
returns trigger
language plpgsql security definer set search_path to ''
as $$
begin
  perform public.award_tournament(new.id);
  return null;
end;
$$;

drop trigger if exists awards_tournament_finished on public.tournaments;
create constraint trigger awards_tournament_finished
  after update of status on public.tournaments
  deferrable initially deferred
  for each row
  when (new.status = 'finished' and old.status is distinct from 'finished')
  execute function public.awards_on_tournament_finished();

drop trigger if exists awards_tournament_inserted_finished on public.tournaments;
create constraint trigger awards_tournament_inserted_finished
  after insert on public.tournaments
  deferrable initially deferred
  for each row
  when (new.status = 'finished')
  execute function public.awards_on_tournament_finished();

-- Cierre de temporada → la división final (una por temporada).
create or replace function public.awards_on_season_closed()
returns trigger
language plpgsql security definer set search_path to ''
as $$
begin
  insert into public.awards (user_id, competition_kind, competition_id, mode_id, award)
  values (new.user_id, 'ranked_season', new.season_id, 'ranked',
          public.ranked_division_id(public.ranked_division(new.final_rating)))
  on conflict (user_id, competition_kind, competition_id) do nothing;
  return null;
end;
$$;

drop trigger if exists awards_season_closed on public.ranked_season_results;
create trigger awards_season_closed
  after insert on public.ranked_season_results
  for each row execute function public.awards_on_season_closed();

revoke all on function public.award_tournament(uuid) from public, anon, authenticated;
revoke all on function public.awards_on_tournament_finished() from public, anon, authenticated;
revoke all on function public.awards_on_season_closed() from public, anon, authenticated;

-- Backfill: torneos ya terminados y temporadas ya cerradas.
do $backfill$
declare r record;
begin
  for r in select id from public.tournaments where status = 'finished' and mode_id <> 'ranked' loop
    perform public.award_tournament(r.id);
  end loop;
  insert into public.awards (user_id, competition_kind, competition_id, mode_id, award)
  select rs.user_id, 'ranked_season', rs.season_id, 'ranked',
         public.ranked_division_id(public.ranked_division(rs.final_rating))
    from public.ranked_season_results rs
  on conflict (user_id, competition_kind, competition_id) do nothing;
end
$backfill$;

-- Perfil → Estadísticas, SOLO desde `awards`.
--  · seasons: una ficha por temporada CERRADA (división final), la más reciente primero.
--  · current: la temporada en curso (división actual · en juego), si jugó alguna ranked en ella.
--  · cups: conteo de copas por modo.
--  · divisions: vacío; se mantiene una versión para el front viejo durante el deploy (dropear después).
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
    'ranked', v_ranked,
    'divisions', '[]'::jsonb);
end;
$$;
