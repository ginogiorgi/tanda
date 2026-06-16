-- Tanda — F4 / tarea 4.5: `resolve_penalty` (a los 10s, idempotente, aleatoria a ausentes).
--
-- Decisión 2026-06-16 (escalabilidad, SPEC §1.2/§1.3): la resolución autoritativa corre EN
-- POSTGRES (plpgsql), no en una Edge Function. El motor TS (`lib/engine/penalty.ts`) sigue
-- siendo la fuente de verdad de la regla §5.2; esto es un PORT FIEL (incl. RNG mulberry32),
-- verificado por paridad. Anti-trampa idéntico: server-authoritative, `correct_index` nunca
-- viaja antes de `resolved`.

-- ───────────────────────── RNG seeded (port de lib/engine/rng.ts) ─────────────────────────
-- Multiplicación de 32 bits mod 2^32 (equivalente a Math.imul). Se hace en `numeric` para no
-- desbordar bigint: (2^32-1)^2 > int8 max.
create function public.engine_imul(x bigint, y bigint)
returns bigint language sql immutable set search_path = '' as $$
  select (((x & 4294967295)::numeric * (y & 4294967295)::numeric) % 4294967296)::bigint;
$$;

-- mulberry32: primera salida del generador para un seed dado (entero sin signo de 32 bits).
-- Equivale a `makeRng(seed)()` antes de dividir por 2^32. Todas las ops se mantienen en
-- [0, 2^32-1] (mask) → `>>` actúa como shift lógico, idéntico al `>>>` de JS.
create function public.engine_mulberry32(p_seed bigint)
returns bigint language plpgsql immutable set search_path = '' as $$
declare
  mask constant bigint := 4294967295;  -- 2^32 - 1
  a bigint; t bigint; x bigint;
begin
  a := ((p_seed & mask) + 1831565813) & mask;          -- a = (seed + 0x6d2b79f5) | 0
  x := (a # (a >> 15)) & mask;                          -- a ^ (a >>> 15)
  t := public.engine_imul(x, 1 | a) & mask;             -- imul(_, 1 | a)
  x := (t # (t >> 7)) & mask;                           -- t ^ (t >>> 7)
  t := (((t + public.engine_imul(x, 61 | t)) & mask) # t) & mask; -- (t + imul(_, 61|t)) ^ t
  return (t # (t >> 14)) & mask;                        -- (t ^ (t >>> 14)) >>> 0
end;
$$;

-- Entero en [0, n): floor(rng()*n) = (mulberry32(seed) * n) div 2^32. Sin floats.
create function public.engine_rand_int(p_seed bigint, p_n int)
returns int language sql immutable set search_path = '' as $$
  select (public.engine_mulberry32(p_seed) * p_n / 4294967296)::int;
$$;

-- Booleano uniforme: rng() < 0.5  ⇔  mulberry32(seed) < 2^31.
create function public.engine_rand_bool(p_seed bigint)
returns boolean language sql immutable set search_path = '' as $$
  select public.engine_mulberry32(p_seed) < 2147483648;
$$;

-- Hash determinista texto → entero de 32 bits (para derivar seeds estables por penal/participante).
create function public.engine_hash32(p_text text)
returns bigint language sql immutable set search_path = '' as $$
  select ('x' || substr(md5(p_text), 1, 8))::bit(32)::bigint;
$$;

-- ───────────────────────── resolve_penalty ─────────────────────────
-- Idempotente (lock de fila con SKIP LOCKED → la ráfaga de pokes simultáneos no espera: el
-- ganador resuelve, el resto es no-op). Solo resuelve con now() >= deadline. A los participantes
-- SIN respuesta les asigna una opción aleatoria seeded (ausencia/desconexión, §3.1/§5.2);
-- aplica la tabla §5.2 (port del motor): "los dos mal" en `first` → `second_chance` (5s, 2
-- opciones) con Broadcast `penal:second_chance`; si no, persiste `resolved`, actualiza el
-- marcador del match y emite `penal:result` (que SÍ incluye `correct_index`, ya está resuelto).
-- NO abre el siguiente penal (eso lo orquesta el reloj de ronda / barrier, tarea 4.6).
create function public.resolve_penalty(p_penalty uuid)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  v_match uuid; v_idx int; v_status public.penalty_status;
  v_deadline timestamptz; v_question uuid; v_kicker uuid; v_keeper uuid;
  v_tournament uuid; v_t_seed bigint; v_seed bigint;
  v_correct int; v_prompt text; v_options jsonb; v_explanation text;
  v_phase public.answer_phase;
  v_home uuid; v_away uuid; v_home_score int; v_away_score int;
  v_k_ans record; v_g_ans record;
  v_k_ok boolean; v_g_ok boolean;
  v_winner text; v_reason text; v_scored boolean; v_variant int;
  v_removed int; v_wrong int[]; v_kw int; v_gw int;
  v_part uuid; v_new_deadline timestamptz;
begin
  -- Lock de la fila solo si está abierta; SKIP LOCKED → si otro la tiene o ya está resuelta, no-op.
  select match_id, idx, status, deadline, question_id, kicker_participant_id, keeper_participant_id
    into v_match, v_idx, v_status, v_deadline, v_question, v_kicker, v_keeper
    from public.penalties
    where id = p_penalty and status in ('open', 'second_chance')
    for update skip locked;
  if v_match is null then return; end if;  -- ya resuelto / lockeado por otro

  -- Poke de un humano: validar pertenencia. tick()/cron (uid null) entra como backstop.
  if uid is not null and not public.is_match_member(v_match) then
    raise exception 'not_participant';
  end if;

  -- Solo resuelve a los 10s (anti-trampa: el server manda, no el reloj del cliente).
  if now() < v_deadline then raise exception 'too_early'; end if;

  v_phase := case v_status when 'open' then 'first' else 'second_chance' end;

  -- Seed reproducible del penal (combina seed del torneo + match + idx).
  select t.id, t.seed into v_tournament, v_t_seed
    from public.matches m join public.tournaments t on t.id = m.tournament_id
    where m.id = v_match;
  v_seed := (coalesce(v_t_seed, 0) # public.engine_hash32(v_match::text || ':' || v_idx)) & 4294967295;

  -- Pregunta (server-only).
  select q.correct_index, q.prompt, q.options, q.explanation
    into v_correct, v_prompt, v_options, v_explanation
    from public.questions q where q.id = v_question;

  -- Ausentes (sin respuesta en esta fase) → opción aleatoria seeded (is_random=true).
  foreach v_part in array array[v_kicker, v_keeper] loop
    if not exists (
      select 1 from public.penalty_answers
      where penalty_id = p_penalty and participant_id = v_part and phase = v_phase
    ) then
      insert into public.penalty_answers
        (penalty_id, participant_id, option_index, selected_at, is_correct, is_random, phase)
      values (
        p_penalty, v_part,
        public.engine_rand_int(v_seed # public.engine_hash32(v_part::text), 3),
        now(), null, true, v_phase
      );
      update public.penalty_answers
        set is_correct = (option_index = v_correct)
        where penalty_id = p_penalty and participant_id = v_part and phase = v_phase;
    end if;
  end loop;

  select option_index, selected_at, is_correct into v_k_ans
    from public.penalty_answers
    where penalty_id = p_penalty and participant_id = v_kicker and phase = v_phase;
  select option_index, selected_at, is_correct into v_g_ans
    from public.penalty_answers
    where penalty_id = p_penalty and participant_id = v_keeper and phase = v_phase;

  v_k_ok := coalesce(v_k_ans.is_correct, false);
  v_g_ok := coalesce(v_g_ans.is_correct, false);

  -- ── Tabla §5.2 (port de decideWinner) ──
  if v_k_ok and v_g_ok then
    if v_k_ans.selected_at < v_g_ans.selected_at then
      v_winner := 'kicker'; v_reason := 'goal';
    elsif v_g_ans.selected_at < v_k_ans.selected_at then
      v_winner := 'keeper'; v_reason := 'save';
    elsif public.engine_rand_bool(v_seed) then
      v_winner := 'kicker'; v_reason := 'goal';
    else
      v_winner := 'keeper'; v_reason := 'save';
    end if;
  elsif v_k_ok then
    v_winner := 'kicker'; v_reason := 'goal';
  elsif v_g_ok then
    v_winner := 'keeper'; v_reason := 'miss_wide';  -- pateador erró → afuera
  else
    v_winner := null;  -- los dos mal
  end if;

  -- ── "Los dos mal" en primera fase → segunda chance (port de pickRemovedOption) ──
  if v_winner is null and v_phase = 'first' then
    select array_agg(i order by i) into v_wrong
      from generate_series(0, 2) i where i <> v_correct;
    v_kw := case when v_k_ans.option_index <> v_correct then v_k_ans.option_index end;
    v_gw := case when v_g_ans.option_index <> v_correct then v_g_ans.option_index end;
    if v_kw is not null and v_kw = v_gw then
      v_removed := v_kw;  -- ambos erraron la misma → esa desaparece
    else
      v_removed := v_wrong[public.engine_rand_int(v_seed, 2) + 1];  -- array 1-indexed
    end if;

    v_new_deadline := now() + interval '5 seconds';
    update public.penalties
      set status = 'second_chance', second_chance = true, removed_option = v_removed,
          started_at = now(), deadline = v_new_deadline
      where id = p_penalty;

    perform realtime.send(
      jsonb_build_object(
        'penalty_id', p_penalty, 'match_id', v_match, 'idx', v_idx,
        'prompt', v_prompt, 'options', v_options, 'removed_option', v_removed,
        'phase', 'second_chance', 'started_at', now(), 'deadline', v_new_deadline,
        'server_now', now()
      ),
      'penal:second_chance', 'match:' || v_match::text, true
    );
    return;
  end if;

  -- ── Resuelto ── (segunda chance fallida → gana el arquero, la tiró afuera)
  if v_winner is null then
    v_winner := 'keeper'; v_reason := 'miss_wide';
  end if;
  v_scored := (v_winner = 'kicker');
  v_variant := public.engine_rand_int((v_seed # 1597334677) & 4294967295, 4);  -- seed ^ 0x5f356495

  update public.penalties
    set status = 'resolved',
        resolution = jsonb_build_object(
          'winner', v_winner, 'scored', v_scored, 'reason', v_reason,
          'variant', v_variant, 'phase', v_phase
        )
    where id = p_penalty;

  -- Marcador: solo el pateador convierte. Sumar al lado del kicker.
  select home_participant_id, away_participant_id into v_home, v_away
    from public.matches where id = v_match;
  if v_scored then
    if v_kicker = v_home then
      update public.matches set home_score = home_score + 1 where id = v_match;
    else
      update public.matches set away_score = away_score + 1 where id = v_match;
    end if;
  end if;
  select home_score, away_score into v_home_score, v_away_score
    from public.matches where id = v_match;

  -- penal:result — ya resuelto, acá SÍ puede viajar la correcta + explicación (§8.11).
  perform realtime.send(
    jsonb_build_object(
      'penalty_id', p_penalty, 'match_id', v_match, 'idx', v_idx,
      'outcome', 'resolved', 'winner', v_winner, 'scored', v_scored,
      'reason', v_reason, 'variant', v_variant, 'phase', v_phase,
      'correct_index', v_correct, 'explanation', v_explanation,
      'home_score', v_home_score, 'away_score', v_away_score
    ),
    'penal:result', 'match:' || v_match::text, true
  );
end;
$$;
grant execute on function public.resolve_penalty(uuid) to authenticated;
