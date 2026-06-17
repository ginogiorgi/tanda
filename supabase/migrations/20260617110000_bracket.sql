-- Tanda — F8 / tarea 8.5: carga inicial del bracket + gate de la pantalla de torneo.
--
-- La UI de bracket (grupos + KO) consume el canal privado `tournament:{id}` (score:live de 6.5)
-- para el VIVO, pero necesita una FOTO inicial de la estructura al montar: get_bracket. Y la
-- pantalla de partido pasa a ser tournament-scoped (te sigue de R32 a la final y muestra el bracket
-- en el tiempo muerto entre rondas), así que necesita resolver "mi torneo activo" aunque en ese
-- instante no tenga un match in_progress (hueco entre partidos): get_active_tournament.
--
-- Nada sensible: participantes (naciones/kits/placement) + matches (marcadores/fase), todo ya
-- visible en el bracket. `correct_index` no aparece por ningún lado.

-- ───────────────────────── get_active_tournament (gate de /partido) ─────────────────────────
-- El torneo en curso del caller donde sigue jugando (no eliminado, no coronado). null si no hay.
create function public.get_active_tournament()
returns jsonb language plpgsql security definer set search_path = '' as $$
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
grant execute on function public.get_active_tournament() to authenticated;

-- ───────────────────────── get_bracket (foto inicial de la estructura) ─────────────────────────
-- participants: brief de nación + grupo + placement/eliminated_phase (para "tu camino" y el árbol).
-- matches: misma forma que el payload de score:live (match_id/phase/group_letter/bracket_slot/status/
-- marcador/ganador + briefs home/away) → el cliente mergea el vivo con applyScoreUpdate sin convertir.
create function public.get_bracket(p_tournament uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
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
grant execute on function public.get_bracket(uuid) to authenticated;
