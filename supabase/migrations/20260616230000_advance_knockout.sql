-- Tanda — F6 / tarea 6.4(c): grupos→KO + eliminatorias hasta campeón + 3er puesto.
--
-- Cierra el camino autoritativo del torneo (PLPGSQL, SPEC §1.2): cuando terminan las 3 jornadas
-- de grupo arma el bracket (2 por grupo + 8 mejores terceros = 32) y juega round_of_32 → round_of_16
-- → quarters → semis → final (+ 3er puesto) hasta coronar campeón. Disparo event-driven:
-- resolve_penalty → progress_match → advance_tournament; tick() de backstop.
--
-- Ports fieles de lib/engine/tournament.ts (rankGroup / bestThirds / buildRoundOf32 / advanceBracket),
-- deterministas por tournaments.seed. drawKey usa el mismo RNG mulberry32 + FNV-1a que el motor TS.

-- ───────────────────────── engine_fnv32 (port de hashStr) ─────────────────────────
-- FNV-1a sobre los code units del texto (ASCII en UUIDs/letras de grupo): offset 2166136261,
-- prime 16777619. Reusa engine_imul (mod 2^32). Es el hash que usa drawKey en tournament.ts.
create function public.engine_fnv32(p_text text)
returns bigint language plpgsql immutable set search_path = '' as $$
declare h bigint := 2166136261; i int; n int := length(p_text);
begin
  for i in 1..n loop
    h := (h # ascii(substr(p_text, i, 1))) & 4294967295;
    h := public.engine_imul(h, 16777619);
  end loop;
  return h & 4294967295;
end;
$$;
revoke all on function public.engine_fnv32(text) from public, anon, authenticated;

-- drawKey(id, seed) del motor = mulberry32((seed ^ fnv(id)))() / 2^32. Para ORDENAR alcanza el
-- valor sin dividir (orden idéntico): engine_mulberry32((seed # fnv(id)) & mask). Se usa inline.

-- ───────────────────────── engine_group_standings (port de rankGroup) ─────────────────────────
-- Tabla de un grupo ordenada con desempates FIFA (SPEC §4): puntos → dif. gol → goles a favor →
-- (entre empatados) h2h puntos → h2h dif. gol → h2h goles a favor → sorteo determinista por seed.
-- El h2h se calcula con SOLO los partidos entre los empatados (igual que el motor TS). Lee los
-- partidos de grupo finished. Devuelve participant_id + rank 1..4 + sus pts/gd/gf globales (para
-- el ranking de terceros). Requiere los 3 partidos por equipo jugados.
create function public.engine_group_standings(p_tournament uuid, p_group text)
returns table(participant_id uuid, rank int, pts int, gd int, gf int)
language plpgsql stable set search_path = '' as $$
declare v_seed bigint;
begin
  select t.seed into v_seed from public.tournaments t where t.id = p_tournament;

  return query
  with mr as (
    select m.home_participant_id as a, m.away_participant_id as b,
           m.home_score as hs, m.away_score as as_
    from public.matches m
    where m.tournament_id = p_tournament and m.phase = 'group'
      and m.group_letter = p_group and m.status = 'finished'
  ),
  perteam as (
    select a as team, b as opp, hs as gf_, as_ as ga_ from mr
    union all
    select b as team, a as opp, as_ as gf_, hs as ga_ from mr
  ),
  teams as (
    select pa.id from public.participants pa
    where pa.tournament_id = p_tournament and pa.group_letter = p_group
  ),
  base as (
    select tm.id as team,
      coalesce(sum(p.gf_), 0)::int as gf,
      coalesce(sum(p.gf_ - p.ga_), 0)::int as gd,
      coalesce(sum(case when p.gf_ > p.ga_ then 3 when p.gf_ = p.ga_ then 1 else 0 end), 0)::int as pts
    from teams tm left join perteam p on p.team = tm.id
    group by tm.id
  ),
  ranked as (
    select b.*, rank() over (order by b.pts desc, b.gd desc, b.gf desc) as orank
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
        h.hpts desc, h.hgd desc, h.hgf desc,
        public.engine_mulberry32((v_seed # public.engine_fnv32(r.team::text)) & 4294967295)))::int,
    r.pts, r.gd, r.gf
  from ranked r join h2h h on h.team = r.team;
end;
$$;
revoke all on function public.engine_group_standings(uuid, text) from public, anon, authenticated;

-- ───────────────────────── build_knockout (grupos → round_of_32) ─────────────────────────
-- Arma el bracket cuando terminan los grupos: 2 por grupo (24) + 8 mejores terceros = 32
-- clasificados; port de buildRoundOf32 (cada ganador de grupo vs un 2º/3º de OTRO grupo,
-- restantes evitando mismo grupo). Inserta 16 matches round_of_32 (bracket_slot 0..15), marca
-- eliminados de fase de grupos y pasa current_phase='round_of_32'. Idempotente.
create function public.build_knockout(p_tournament uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_seed bigint;
  letter text; rec record;
  q_team uuid[] := '{}'; q_group text[] := '{}'; q_slot int[] := '{}';
  t_team uuid[] := '{}'; t_group text[] := '{}';
  t_pts int[] := '{}'; t_gd int[] := '{}'; t_gf int[] := '{}';
  n_third int; k int;
  win_team uuid[]; win_group text[]; pool_team uuid[]; pool_group text[];
  m_home uuid[] := '{}'; m_away uuid[] := '{}';
  i int; j int; a_team uuid; a_group text;
begin
  -- idempotencia: si ya existe el bracket, no rehacer.
  if exists (select 1 from public.matches
             where tournament_id = p_tournament and phase = 'round_of_32') then
    return;
  end if;

  select seed into v_seed from public.tournaments where id = p_tournament;

  -- 1º/2º de cada grupo → qualified; 3º → al pool de terceros; 4º → eliminado en grupos.
  for letter in
    select distinct group_letter from public.participants
    where tournament_id = p_tournament and group_letter is not null
    order by 1
  loop
    for rec in select * from public.engine_group_standings(p_tournament, letter) loop
      if rec.rank <= 2 then
        q_team := q_team || rec.participant_id; q_group := q_group || letter; q_slot := q_slot || rec.rank;
      elsif rec.rank = 3 then
        t_team := t_team || rec.participant_id; t_group := t_group || letter;
        t_pts := t_pts || rec.pts; t_gd := t_gd || rec.gd; t_gf := t_gf || rec.gf;
      else
        update public.participants set eliminated_phase = 'group' where id = rec.participant_id;
      end if;
    end loop;
  end loop;

  -- 8 mejores terceros (puntos → dif. gol → goles a favor → sorteo); resto eliminados.
  n_third := coalesce(array_length(t_team, 1), 0);
  k := 0;
  for rec in
    select team, grp from unnest(t_team, t_group, t_pts, t_gd, t_gf) as u(team, grp, pts, gd, gf)
    order by pts desc, gd desc, gf desc,
      public.engine_mulberry32((v_seed # public.engine_fnv32(team::text)) & 4294967295)
  loop
    k := k + 1;
    if k <= 8 then
      q_team := q_team || rec.team; q_group := q_group || rec.grp; q_slot := q_slot || 3;
    else
      update public.participants set eliminated_phase = 'group' where id = rec.team;
    end if;
  end loop;

  -- buildRoundOf32: ganadores (slot 1) y pool (2º/3º), ambos ordenados por drawKey asc.
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

  -- cada ganador de grupo vs el primer disponible de OTRO grupo (si no hay, el primero).
  for i in 1 .. coalesce(array_length(win_team, 1), 0) loop
    j := coalesce((
      select min(idx) from generate_subscripts(pool_group, 1) idx where pool_group[idx] <> win_group[i]
    ), 1);
    m_home := m_home || win_team[i]; m_away := m_away || pool_team[j];
    pool_team  := pool_team[1:j-1]  || pool_team[j+1:];
    pool_group := pool_group[1:j-1] || pool_group[j+1:];
  end loop;

  -- restantes del pool, emparejados también evitando mismo grupo (shift + take-different).
  while coalesce(array_length(pool_team, 1), 0) > 0 loop
    a_team := pool_team[1]; a_group := pool_group[1];
    pool_team := pool_team[2:]; pool_group := pool_group[2:];
    j := coalesce((
      select min(idx) from generate_subscripts(pool_group, 1) idx where pool_group[idx] <> a_group
    ), 1);
    m_home := m_home || a_team; m_away := m_away || pool_team[j];
    pool_team  := pool_team[1:j-1]  || pool_team[j+1:];
    pool_group := pool_group[1:j-1] || pool_group[j+1:];
  end loop;

  -- 16 cruces de round_of_32 en orden de bracket (bracket_slot 0..15).
  insert into public.matches
    (tournament_id, phase, bracket_slot, home_participant_id, away_participant_id, is_bot_only, status)
  select p_tournament, 'round_of_32', g.gi - 1, m_home[g.gi], m_away[g.gi],
    ((select is_bot from public.participants where id = m_home[g.gi])
       and (select is_bot from public.participants where id = m_away[g.gi])),
    'pending'
  from generate_series(1, coalesce(array_length(m_home, 1), 0)) as g(gi);

  update public.tournaments set current_phase = 'round_of_32' where id = p_tournament;
end;
$$;
revoke all on function public.build_knockout(uuid) from public, anon, authenticated;

-- ───────────────────────── advance_ko_round (avanza una ronda KO / corona) ─────────────────────────
-- Cuando todos los matches de la fase KO actual terminaron: empareja ganadores en orden de bracket
-- (advanceBracket: 2k vs 2k+1) y crea la fase siguiente. En semis crea además el 3er puesto con los
-- perdedores. En final corona campeón + 3er puesto y cierra torneo/sala. Idempotente.
create function public.advance_ko_round(p_tournament uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_phase public.tournament_phase; v_cur public.match_phase; v_next public.tournament_phase;
  v_next_match public.match_phase;
  v_room uuid;
  v_champ uuid; v_runner uuid; v_third uuid; v_fourth uuid;
begin
  select current_phase into v_phase from public.tournaments
    where id = p_tournament and status = 'in_progress';
  if v_phase is null then return; end if;

  -- ── Final + 3er puesto terminados → coronar y cerrar. ──
  if v_phase = 'final' then
    if exists (select 1 from public.matches
               where tournament_id = p_tournament and phase in ('final', 'third_place')
                 and status <> 'finished') then
      return;
    end if;

    select winner_participant_id,
           case when winner_participant_id = home_participant_id then away_participant_id else home_participant_id end
      into v_champ, v_runner
      from public.matches where tournament_id = p_tournament and phase = 'final';
    select winner_participant_id,
           case when winner_participant_id = home_participant_id then away_participant_id else home_participant_id end
      into v_third, v_fourth
      from public.matches where tournament_id = p_tournament and phase = 'third_place';

    update public.participants set placement = 1 where id = v_champ;
    update public.participants set placement = 2, eliminated_phase = 'final' where id = v_runner;
    update public.participants set placement = 3 where id = v_third;
    update public.participants set placement = 4, eliminated_phase = 'third_place' where id = v_fourth;

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

  if not exists (select 1 from public.matches
                 where tournament_id = p_tournament and phase = v_next_match) then
    -- ganadores en orden de bracket → emparejar 2k vs 2k+1 (advanceBracket).
    insert into public.matches
      (tournament_id, phase, bracket_slot, home_participant_id, away_participant_id, is_bot_only, status)
    with w as (
      select winner_participant_id as wid,
             row_number() over (order by bracket_slot) - 1 as ord
      from public.matches
      where tournament_id = p_tournament and phase = v_cur and status = 'finished'
    )
    select p_tournament, v_next_match, (h.ord / 2)::int, h.wid, a.wid,
      ((select is_bot from public.participants where id = h.wid)
         and (select is_bot from public.participants where id = a.wid)),
      'pending'
    from w h join w a on a.ord = h.ord + 1 and h.ord % 2 = 0;

    -- semis → 3er puesto con los perdedores (no se marcan eliminados; juegan otra vez).
    if v_phase = 'semis' then
      insert into public.matches
        (tournament_id, phase, bracket_slot, home_participant_id, away_participant_id, is_bot_only, status)
      with l as (
        select case when winner_participant_id = home_participant_id
                    then away_participant_id else home_participant_id end as lid,
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
      -- rondas previas a semis: los perdedores quedan eliminados en esta fase.
      update public.participants set eliminated_phase = v_cur
      where id in (
        select case when winner_participant_id = home_participant_id
                    then away_participant_id else home_participant_id end
        from public.matches
        where tournament_id = p_tournament and phase = v_cur and status = 'finished'
      );
    end if;
  end if;

  update public.tournaments set current_phase = v_next
    where id = p_tournament and current_phase = v_phase;
end;
$$;
revoke all on function public.advance_ko_round(uuid) from public, anon, authenticated;

-- ───────────────────────── advance_tournament (gate por fase, completo) ─────────────────────────
-- Reemplaza la versión de 6.4(b) (que sólo encadenaba jornadas de grupo). Idempotente: si hay un
-- match en juego, no hace nada (espera la resolución de penales). Loop event-driven + backstop tick().
create or replace function public.advance_tournament(p_tournament uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_phase public.tournament_phase; v_pending int; v_total int; v_unfinished int;
begin
  loop
    select current_phase into v_phase from public.tournaments
      where id = p_tournament and status = 'in_progress';
    if v_phase is null then return; end if;

    if v_phase = 'groups' then
      if exists (select 1 from public.matches
                 where tournament_id = p_tournament and phase = 'group'
                   and status in ('in_progress', 'sudden_death')) then
        return;  -- jornada en curso
      end if;
      if exists (select 1 from public.matches
                 where tournament_id = p_tournament and phase = 'group' and status = 'pending') then
        perform public.open_round(p_tournament);  -- abre la próxima jornada
        continue;
      else
        perform public.build_knockout(p_tournament);  -- grupos completos → arma el bracket
        continue;
      end if;
    end if;

    -- Fases de eliminación (la 'final' incluye el 3er puesto).
    if exists (select 1 from public.matches m
               where m.tournament_id = p_tournament and m.status in ('in_progress', 'sudden_death')
                 and (m.phase::text = v_phase::text or (v_phase = 'final' and m.phase = 'third_place'))) then
      return;  -- partido en curso
    end if;

    select count(*) filter (where status = 'pending'),
           count(*),
           count(*) filter (where status <> 'finished')
      into v_pending, v_total, v_unfinished
      from public.matches m
      where m.tournament_id = p_tournament
        and (m.phase::text = v_phase::text or (v_phase = 'final' and m.phase = 'third_place'));

    if v_total = 0 then
      return;  -- defensivo: la fase aún no tiene matches
    elsif v_pending > 0 then
      perform public.open_round(p_tournament);  -- abre los pendientes (bot-only al instante)
      continue;
    elsif v_unfinished = 0 then
      perform public.advance_ko_round(p_tournament);  -- ronda completa → siguiente / corona
      continue;
    else
      return;
    end if;
  end loop;
end;
$$;
revoke all on function public.advance_tournament(uuid) from public, anon, authenticated;
