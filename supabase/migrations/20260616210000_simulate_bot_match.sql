-- Tanda — F6 / tarea 6.4 (a): `simulate_bot_match` — resuelve un partido bot-only AL INSTANTE.
--
-- Los partidos sin humanos (is_bot_only) no corren en realtime ni consumen preguntas del banco
-- (decisión SPEC / §9): se simulan de una. Esto porta a SQL la regla del partido:
--   - `engine_advance_match` = PORT FIEL de lib/engine/match.ts advanceMatch (alternancia home
--     impares / away pares, corte por resultado decidido en eliminación, muerte súbita por ronda).
--   - `bot_penalty_scored` = §5.2 para bot-vs-bot: con `engine_bot_intent` (5.3) decide si el
--     pateador convierte (acierta y el arquero no, o ambos aciertan y el pateador es más rápido,
--     o vía segunda chance). Determinista por el seed del torneo → reproducible.
-- `simulate_bot_match` corre la tanda y persiste el marcador final en `matches`
-- (home_score/away_score/winner_participant_id/status='finished'). NO crea filas de `penalties`
-- (un bot-only no las necesita y así no consume preguntas). El avance de fase (6.4 c) lo usará
-- para liquidar todos los matches bot-only de una jornada.

-- ───────────────────────── engine_advance_match (port de lib/engine/match.ts) ─────────────────────────
create function public.engine_advance_match(
  p_kind text, p_scored boolean[],
  out status text, out next_index int, out next_kicker text,
  out home int, out away int, out winner text
)
language plpgsql immutable set search_path = '' as $$
declare
  n int := coalesce(array_length(p_scored, 1), 0);
  hk int := 0; ak int := 0; i int; home_rem int; away_rem int; sdk int;
begin
  home := 0; away := 0;
  for i in 1..n loop
    if i % 2 = 1 then
      hk := hk + 1; if p_scored[i] then home := home + 1; end if;
    else
      ak := ak + 1; if p_scored[i] then away := away + 1; end if;
    end if;
  end loop;

  -- Regulación en curso (n < 10).
  if n < 10 then
    if p_kind = 'elimination' then
      home_rem := 5 - hk; away_rem := 5 - ak;
      if home > away + away_rem or away > home + home_rem then
        status := 'finished'; winner := case when home > away then 'home' else 'away' end; return;
      end if;
    end if;
    status := 'in_progress'; next_index := n + 1;
    next_kicker := case when (n + 1) % 2 = 1 then 'home' else 'away' end; return;
  end if;

  -- Fin de regulación (n = 10).
  if n = 10 then
    if home <> away then
      status := 'finished'; winner := case when home > away then 'home' else 'away' end; return;
    end if;
    if p_kind = 'group' then status := 'finished'; winner := null; return; end if;  -- empate OK
    status := 'sudden_death'; next_index := n + 1;
    next_kicker := case when (n + 1) % 2 = 1 then 'home' else 'away' end; return;
  end if;

  -- Muerte súbita (n > 10): se decide al cerrar una ronda completa (ambos patearon).
  sdk := n - 10;
  if sdk % 2 = 0 and home <> away then
    status := 'finished'; winner := case when home > away then 'home' else 'away' end; return;
  end if;
  status := 'sudden_death'; next_index := n + 1;
  next_kicker := case when (n + 1) % 2 = 1 then 'home' else 'away' end;
end;
$$;

-- ───────────────────────── bot_penalty_scored (§5.2 para bot-vs-bot) ─────────────────────────
-- ¿Convierte el pateador? Seeds por participante/fase coherentes con precompute_bot_intents (5.3).
create function public.bot_penalty_scored(
  p_seedp bigint, p_k_tier public.difficulty_tier, p_g_tier public.difficulty_tier,
  p_kicker uuid, p_keeper uuid
)
returns boolean language plpgsql immutable set search_path = '' as $$
declare
  mask constant bigint := 4294967295;
  ks bigint; gs bigint; kwc boolean; kdl int; gwc boolean; gdl int;
begin
  -- Primera fase.
  ks := (p_seedp # public.engine_hash32(p_kicker::text || ':first')) & mask;
  gs := (p_seedp # public.engine_hash32(p_keeper::text || ':first')) & mask;
  select will_be_correct, delay_ms into kwc, kdl from public.engine_bot_intent(p_k_tier, ks);
  select will_be_correct, delay_ms into gwc, gdl from public.engine_bot_intent(p_g_tier, gs);
  if kwc and gwc then
    if kdl < gdl then return true; elsif gdl < kdl then return false;
    else return public.engine_rand_bool(p_seedp); end if;
  elsif kwc then return true;       -- pateador acierta, arquero no → gol
  elsif gwc then return false;      -- arquero acierta, pateador no → atajada
  end if;

  -- "Los dos mal" → segunda chance.
  ks := (p_seedp # public.engine_hash32(p_kicker::text || ':second_chance')) & mask;
  gs := (p_seedp # public.engine_hash32(p_keeper::text || ':second_chance')) & mask;
  select will_be_correct, delay_ms into kwc, kdl from public.engine_bot_intent(p_k_tier, ks);
  select will_be_correct, delay_ms into gwc, gdl from public.engine_bot_intent(p_g_tier, gs);
  if kwc and gwc then
    if kdl < gdl then return true; elsif gdl < kdl then return false;
    else return public.engine_rand_bool(p_seedp); end if;
  elsif kwc then return true;
  end if;
  return false;  -- erró de nuevo / solo el arquero acertó → gana el arquero
end;
$$;

-- ───────────────────────── simulate_bot_match ─────────────────────────
create function public.simulate_bot_match(p_match uuid)
returns void language plpgsql security definer set search_path = '' as $$
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
  if v_status = 'finished' then return; end if;            -- idempotente
  if v_home is null or v_away is null then raise exception 'match_incomplete'; end if;

  v_kind := case when v_phase = 'group' then 'group' else 'elimination' end;
  select coalesce(difficulty_tier, 'medium') into v_home_tier
    from public.participants p left join public.nations n on n.id = p.nation_id where p.id = v_home;
  select coalesce(difficulty_tier, 'medium') into v_away_tier
    from public.participants p left join public.nations n on n.id = p.nation_id where p.id = v_away;

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
    exit when array_length(v_scored, 1) > 60;  -- tope de seguridad (muerte súbita interminable)
  end loop;

  update public.matches
    set home_score = st.home, away_score = st.away, status = 'finished',
        winner_participant_id = case st.winner
          when 'home' then v_home when 'away' then v_away else null end
    where id = p_match;
end;
$$;
revoke all on function public.simulate_bot_match(uuid) from public, anon, authenticated;
