-- Eliminación al terminar el PARTIDO, no la ronda (feedback 2, P5 — "la derrota aparece al final").
-- Antes `eliminated_phase` se escribía en `advance_ko_round` cuando terminaba TODA la ronda, y al
-- subcampeón recién cuando terminaba el torneo (después del 3er puesto). El cliente deriva "estoy
-- afuera" de ese campo → el cartel llegaba tarde.
--
-- Un trigger sobre `matches` (no en cada función): cubre TODOS los caminos que terminan un partido
-- (`finalize_match`, `progress_match`, `ranked_forfeit`, bots). Mismos valores que `advance_ko_round`,
-- que los sigue escribiendo igual (idempotente por valor) para torneos viejos.
--  · KO (no final): perdedor → `eliminated_phase = fase`.
--  · semis con 3er puesto: nada (los perdedores vuelven a jugar).
--  · final: perdedor → `placement = 2`, `eliminated_phase = 'final'`.
--  · 3er puesto: perdedor → `placement = 4`, `eliminated_phase = 'third_place'`.
-- Los premios no cambian: se otorgan cuando el torneo pasa a `finished`.

create or replace function public.ko_mark_loser()
returns trigger
language plpgsql security definer set search_path to ''
as $$
declare v_loser uuid; v_third boolean;
begin
  if new.phase = 'group' or new.winner_participant_id is null then return null; end if;
  v_loser := case when new.winner_participant_id = new.home_participant_id
                  then new.away_participant_id else new.home_participant_id end;
  if v_loser is null then return null; end if;

  if new.phase = 'semis' then
    select gm.third_place into v_third
      from public.tournaments t join public.game_modes gm on gm.id = t.mode_id
     where t.id = new.tournament_id;
    if v_third then return null; end if;
  end if;

  if new.phase = 'final' then
    update public.participants set placement = 2, eliminated_phase = 'final'
     where id = v_loser and placement is null;
  elsif new.phase = 'third_place' then
    update public.participants set placement = 4, eliminated_phase = 'third_place'
     where id = v_loser and placement is null;
  else
    update public.participants set eliminated_phase = new.phase
     where id = v_loser and eliminated_phase is null;
  end if;
  return null;
end;
$$;
revoke execute on function public.ko_mark_loser() from public, anon, authenticated;

create trigger matches_ko_mark_loser
  after update of status on public.matches
  for each row
  when (new.status = 'finished' and old.status is distinct from 'finished')
  execute function public.ko_mark_loser();
