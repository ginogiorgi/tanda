-- Tanda — F10 / 10.10: historial real del jugador. `getTournamentHistory` era un STUB ([]) desde 2.7
-- porque las tablas no existían; ya existen. Las tablas son deny-all (RLS sin policy de SELECT por
-- pertenencia para participants/matches/tournaments), así que un SELECT directo del cliente daría 0
-- filas → la lectura va por RPC SECURITY DEFINER, como get_active_tournament/get_bracket.
--
-- Devuelve una fila por participación (no-bot) del caller: nación, placement/eliminated_phase y la
-- agregación de sus matches finalizados (goles a favor, jugados, ganados) + la fecha del torneo. El
-- shape mapea 1:1 a TournamentHistoryEntry (lib/profile/history.ts); aggregateStats queda en TS.
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
    where p.user_id = uid and p.is_bot = false
  ) sub;

  return v_result;
end;
$$;
-- Esta migración corre DESPUÉS del hardening (20260617130000), que revocó el grant default de PUBLIC
-- de las funciones previas pero no cubre las nuevas → revocamos PUBLIC/anon a mano (least-privilege).
revoke all on function public.get_tournament_history() from public, anon;
grant execute on function public.get_tournament_history() to authenticated;
