-- ════════════════════════════════════════════════════════════════════════════
-- Fase 5 — Variedad de preguntas dentro de un torneo.
--
-- `questions.topic` agrupa preguntas sobre el MISMO hecho (o la misma plantilla): lo calcula
-- `pnpm questions:topics` desde data/ (componentes de casi-duplicados y "filtraciones", p. ej.
-- "¿Qué club ganó el Apertura 2010?" + "¿Qué DT ganó el Apertura 2010 con Estudiantes?").
-- `take_tournament_question` ahora PREFIERE, en este orden:
--   1. no repetir pregunta (como antes),
--   2. un tema que todavía no salió en el torneo (ni repetidas ni una que regale la otra),
--   3. una categoría distinta de la última pregunta tomada (diversidad penal a penal),
-- y si no hay, cae al comportamiento anterior: nunca se queda sin pregunta.
-- ════════════════════════════════════════════════════════════════════════════

alter table public.questions add column if not exists topic text;
create index if not exists questions_topic_idx on public.questions (topic) where topic is not null;
comment on column public.questions.topic is 'Grupo de mismo hecho/plantilla (data/questions, pnpm questions:topics). El server evita repetir tema en un torneo.';

alter table public.tournament_questions add column if not exists taken_at timestamptz not null default clock_timestamp();

create or replace function public.take_tournament_question(p_tournament uuid, p_difficulty public.difficulty, p_seed bigint)
returns uuid
language plpgsql security definer set search_path to ''
as $$
declare
  v_question uuid; v_order public.difficulty[]; v_diff public.difficulty; v_mode text; v_pool text[];
  v_topics text[]; v_last_cat text;
begin
  select mode_id into v_mode from public.tournaments where id = p_tournament;
  -- Ranked: bancos de todos los modos jugables mezclados.
  v_pool := case when v_mode = 'ranked'
    then array(select gm.id from public.game_modes gm where gm.active)
    else array[v_mode] end;

  -- Temas ya usados en el torneo + categoría de la última pregunta tomada.
  select coalesce(array_agg(distinct q.topic) filter (where q.topic is not null), '{}')
    into v_topics
    from public.tournament_questions tq join public.questions q on q.id = tq.question_id
    where tq.tournament_id = p_tournament;
  select q.category into v_last_cat
    from public.tournament_questions tq join public.questions q on q.id = tq.question_id
    where tq.tournament_id = p_tournament
    order by tq.taken_at desc limit 1;

  v_order := case p_difficulty
    when 'easy'      then array['easy','medium','hard','very_hard']::public.difficulty[]
    when 'medium'    then array['medium','easy','hard','very_hard']::public.difficulty[]
    when 'hard'      then array['hard','very_hard','medium','easy']::public.difficulty[]
    when 'very_hard' then array['very_hard','hard','medium','easy']::public.difficulty[]
  end;

  foreach v_diff in array v_order loop
    select q.id into v_question
    from public.questions q
    where q.mode_id = any(v_pool) and q.difficulty = v_diff
      and not exists (select 1 from public.tournament_questions tq
                      where tq.tournament_id = p_tournament and tq.question_id = q.id)
    order by (q.topic is not null and q.topic = any(v_topics)),
             (q.category is not distinct from v_last_cat),
             md5(p_seed::text || ':' || q.id::text)
    limit 1;
    exit when v_question is not null;
  end loop;

  if v_question is null then
    select q.id into v_question from public.questions q
    where q.mode_id = any(v_pool) and q.difficulty = p_difficulty
    order by md5(p_seed::text || ':' || q.id::text)
    limit 1;
  end if;

  if v_question is null then
    raise exception 'no_questions_available' using detail = v_mode || ':' || p_difficulty::text;
  end if;

  insert into public.tournament_questions (tournament_id, question_id) values (p_tournament, v_question)
    on conflict do nothing;
  return v_question;
end;
$$;

revoke all on function public.take_tournament_question(uuid, public.difficulty, bigint) from public, anon, authenticated;
