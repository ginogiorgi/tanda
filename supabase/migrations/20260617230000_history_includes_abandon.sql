-- Tanda — F10 / 10.10 (fix): el abandono aparece en el historial.
--
-- Bug: `abandon` marca al participante `is_bot = true` (conservando su `user_id`), pero
-- `get_tournament_history` filtraba `is_bot = false` → el humano que abandonó quedaba EXCLUIDO del
-- historial. Regla pedida (Gino): gane, pierda o abandone, toda participación aparece.
--
-- Fix:
--   • columna `participants.abandoned` para distinguir "humano que abandonó" de "bot puro" y poder
--     etiquetarlo en la UI (un bot que gane tras tu abandono NO es tu título).
--   • `abandon` setea `abandoned = true`.
--   • `get_tournament_history` filtra solo por `user_id = uid` (los bots PUROS tienen `user_id = null`,
--     así que esto nunca trae bots e incluye al que abandonó) y expone `abandoned`.

alter table public.participants add column if not exists abandoned boolean not null default false;
comment on column public.participants.abandoned is
  'true = humano que tocó Abandonar (pasó a bot pero conserva user_id). Distingue del bot puro (user_id null).';

-- ───────────────────────── abandon (+ abandoned = true) ─────────────────────────
create or replace function public.abandon(p_match uuid)
 returns void
 language plpgsql security definer set search_path to '' as $function$
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
$function$;

-- ───────────────────────── get_tournament_history (incluye abandono) ─────────────────────────
create or replace function public.get_tournament_history()
returns jsonb language plpgsql security definer set search_path = '' as $$
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
