-- build_knockout (Mundial): el emparejamiento greedy de 16avos a veces cruzaba a dos del MISMO grupo
-- (los últimos del pozo compartían grupo y el fallback los juntaba). Dependía del seed → era el "flake"
-- de tournament_e2e. Se agrega una pasada de reparación determinista, port 1:1 de
-- lib/engine/tournament.ts buildRoundOf32 (test de propiedad de 5000 seeds en el motor).
-- Solo cambia cruces que antes eran inválidos: el resto del cuadro queda igual.

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
  m_home uuid[] := '{}'; m_away uuid[] := '{}'; m_hg text[] := '{}'; m_ag text[] := '{}';
  r int; t_swap uuid; g_swap text;
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
      m_hg := m_hg || win_group[i]; m_ag := m_ag || pool_group[j];
      pool_team  := pool_team[1:j-1]  || pool_team[j+1:];
      pool_group := pool_group[1:j-1] || pool_group[j+1:];
    end loop;

    while coalesce(array_length(pool_team, 1), 0) > 0 loop
      a_team := pool_team[1]; a_group := pool_group[1];
      pool_team := pool_team[2:]; pool_group := pool_group[2:];
      j := coalesce((select min(idx) from generate_subscripts(pool_group, 1) idx where pool_group[idx] <> a_group), 1);
      m_home := m_home || a_team; m_away := m_away || pool_team[j];
      m_hg := m_hg || a_group; m_ag := m_ag || pool_group[j];
      pool_team  := pool_team[1:j-1]  || pool_team[j+1:];
      pool_group := pool_group[1:j-1] || pool_group[j+1:];
    end loop;

    -- Reparación (port de buildRoundOf32): el greedy puede dejar un cruce del mismo grupo cuando los
    -- últimos del pozo comparten grupo. Se cambia su visitante por el del primer cruce donde ninguno
    -- es de ese grupo → los dos quedan válidos.
    for i in 1 .. coalesce(array_length(m_home, 1), 0) loop
      continue when m_hg[i] <> m_ag[i];
      r := (select min(x) from generate_subscripts(m_home, 1) x
            where m_hg[x] <> m_hg[i] and m_ag[x] <> m_hg[i]);
      continue when r is null;
      t_swap := m_away[r]; g_swap := m_ag[r];
      m_away[r] := m_away[i]; m_ag[r] := m_ag[i];
      m_away[i] := t_swap; m_ag[i] := g_swap;
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
