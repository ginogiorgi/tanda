-- ════════════════════════════════════════════════════════════════════════════
-- get_tournament_history — desenlace correcto al ser eliminado en fase de grupos.
--
-- Bug: el `outcome` se derivaba del ÚLTIMO partido jugado. Un jugador eliminado en grupos que ganó
-- su último partido de grupos salía como 'won' ("Ganaste"), cuando el torneo fue una derrota.
--
-- Fix: rama extra mínima — si eliminated_phase = 'group' el desenlace es 'lost' (derrota), aunque
-- haya ganado el último partido. El resto (KO y podio) queda igual: en KO el último partido jugado
-- ES el que perdió al ser eliminado, así que la heurística sigue siendo correcta ahí.
-- ════════════════════════════════════════════════════════════════════════════
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
        'nationCode', n.code,
        'kitPrimary', n.kit_primary,
        'placement', p.placement,
        'eliminatedPhase', p.eliminated_phase,
        'abandoned', p.abandoned,
        'goalsFor', coalesce(agg.goals_for, 0),
        'matchesPlayed', coalesce(agg.played, 0),
        'matchesWon', coalesce(agg.won, 0),
        'playedAt', t.created_at,
        -- Partido más avanzado y terminado del jugador (para la tarjeta tipo resultado, tarea 7).
        'finalPhase', lm.phase,
        'finalMyScore', lm.my_score,
        'finalOppScore', lm.opp_score,
        'finalOppNationCode', opn.code,
        'finalOppKitPrimary', opn.kit_primary,
        'outcome', case
          when p.abandoned then 'abandoned'
          -- Eliminado en grupos = derrota del torneo, aunque haya ganado el último partido de grupos.
          when p.eliminated_phase = 'group' then 'lost'
          when lm.match_id is null then null
          when lm.winner_participant_id = p.id then 'won'
          else 'lost' end
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
      left join lateral (
        select
          m.match_id_v as match_id, m.phase, m.winner_participant_id,
          case when m.home_participant_id = p.id then m.home_score else m.away_score end as my_score,
          case when m.home_participant_id = p.id then m.away_score else m.home_score end as opp_score,
          case when m.home_participant_id = p.id then m.away_participant_id
               else m.home_participant_id end as opp_id
        from (
          select mm.id as match_id_v, mm.phase, mm.winner_participant_id,
                 mm.home_participant_id, mm.away_participant_id, mm.home_score, mm.away_score
          from public.matches mm
          where mm.status = 'finished'
            and (mm.home_participant_id = p.id or mm.away_participant_id = p.id)
          order by case mm.phase::text
            when 'group' then 0 when 'round_of_32' then 1 when 'round_of_16' then 2
            when 'quarters' then 3 when 'semis' then 4 when 'third_place' then 5
            when 'final' then 6 else -1 end desc,
            mm.created_at desc
          limit 1
        ) m
      ) lm on true
      left join public.participants opp on opp.id = lm.opp_id
      left join public.nations opn on opn.id = opp.nation_id
    where p.user_id = uid   -- los bots puros tienen user_id null → solo trae participaciones humanas
  ) sub;

  return v_result;
end;
$$;
