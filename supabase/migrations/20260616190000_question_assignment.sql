-- Tanda — F7 / tarea 7.4: asignación de preguntas a los penales.
--
-- Dos primitivos que consumirá el avance de torneo (6.4); acá NO se crean penales todavía.
--
-- 1) `tanda_penalty_difficulty(phase, idx)` — PORT FIEL de `penaltyDifficulty` (lib/engine/
--    difficulty.ts, §9.3 BRIEF). El motor TS es la fuente de la regla; esta es su versión SQL,
--    verificada por paridad (decisión SPEC §1.2). IMMUTABLE: misma entrada → misma salida.
--
-- 2) `take_tournament_question(p_tournament, p_difficulty, p_seed)` — elige una pregunta de la
--    dificultad pedida que el torneo TODAVÍA no usó (no figura en `tournament_questions`), la
--    reserva ahí (no-repeat intra-torneo) y devuelve su id. Determinista por `p_seed` para que el
--    torneo sea reproducible. Si se agota el pool de esa dificultad, relaja a la dificultad
--    adyacente; en el peor caso (banco mínimo) permite repetir. No es client-callable.
--
-- CONTRATO para 6.4 (no se implementa acá): por cada ronda con ≥1 humano, 6.4 llama
-- `take_tournament_question` UNA vez por índice de penal (1-5; dificultad =
-- `tanda_penalty_difficulty(phase, idx)`, seed derivado del seed del torneo + ronda + idx) y
-- asigna el MISMO `question_id` a los penales de todos los matches con humanos de esa ronda. Los
-- bot-only se simulan al instante y NO consumen preguntas (no llaman a esta función).

-- ───────────────────────── tanda_penalty_difficulty ─────────────────────────
create function public.tanda_penalty_difficulty(p_phase public.match_phase, p_idx int)
returns public.difficulty
language sql immutable set search_path = '' as $$
  select case
    when p_idx <= 3 then
      case p_phase
        when 'group' then 'easy'::public.difficulty
        when 'round_of_32' then 'medium'::public.difficulty
        when 'round_of_16' then 'medium'::public.difficulty
        when 'quarters' then 'medium'::public.difficulty
        else 'hard'::public.difficulty  -- semis, third_place, final
      end
    else
      case p_phase
        when 'group' then 'medium'::public.difficulty
        when 'round_of_32' then 'hard'::public.difficulty
        when 'round_of_16' then 'hard'::public.difficulty
        when 'quarters' then 'hard'::public.difficulty
        else 'very_hard'::public.difficulty  -- semis, third_place, final
      end
  end;
$$;
comment on function public.tanda_penalty_difficulty(public.match_phase, int) is
  'Port SQL de lib/engine/difficulty.ts penaltyDifficulty (§9.3). Verificado por paridad.';

-- ───────────────────────── take_tournament_question ─────────────────────────
-- Dificultades adyacentes para el fallback si se agota el pool (orden de cercanía).
create function public.take_tournament_question(
  p_tournament uuid, p_difficulty public.difficulty, p_seed bigint
)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_question uuid;
  v_order public.difficulty[];
  v_diff public.difficulty;
begin
  -- Orden de búsqueda: la dificultad pedida primero, luego las adyacentes (último recurso).
  v_order := case p_difficulty
    when 'easy'      then array['easy','medium','hard','very_hard']::public.difficulty[]
    when 'medium'    then array['medium','easy','hard','very_hard']::public.difficulty[]
    when 'hard'      then array['hard','very_hard','medium','easy']::public.difficulty[]
    when 'very_hard' then array['very_hard','hard','medium','easy']::public.difficulty[]
  end;

  -- 1) Pregunta no usada por este torneo, recorriendo dificultades por cercanía.
  foreach v_diff in array v_order loop
    select q.id into v_question
    from public.questions q
    where q.difficulty = v_diff
      and not exists (
        select 1 from public.tournament_questions tq
        where tq.tournament_id = p_tournament and tq.question_id = q.id
      )
    order by md5(p_seed::text || ':' || q.id::text)
    limit 1;
    exit when v_question is not null;
  end loop;

  -- 2) Último recurso: el banco entero ya está consumido → permitir repetir (determinista).
  if v_question is null then
    select q.id into v_question
    from public.questions q
    where q.difficulty = p_difficulty
    order by md5(p_seed::text || ':' || q.id::text)
    limit 1;
  end if;

  if v_question is null then
    raise exception 'no_questions_available' using detail = p_difficulty::text;
  end if;

  insert into public.tournament_questions (tournament_id, question_id)
    values (p_tournament, v_question)
    on conflict do nothing;

  return v_question;
end;
$$;
revoke all on function public.take_tournament_question(uuid, public.difficulty, bigint)
  from public, anon, authenticated;
