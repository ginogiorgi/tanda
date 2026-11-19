-- ════════════════════════════════════════════════════════════════════════════
-- Feedback 3 #16 — No repetir preguntas ENTRE torneos (todos los modos).
--
-- Diagnóstico (prod, 18/11): dentro de un torneo no se repetía nada por jugador; se repetía entre
-- torneos (dos de Argentino seguidos: 99 penales, 96 preguntas distintas, 30 temas para 23 distintos).
-- `take_tournament_question` solo miraba `tournament_questions` (el torneo actual).
--
--  * `user_seen_questions`: qué pregunta vio cada humano y cuándo (la registra `open_penalty_internal`
--    para el pateador y el arquero humanos). Interna: RLS sin policy y sin grants al cliente.
--  * `take_tournament_question`: excluye lo que vio CUALQUIER humano del torneo y ordena por tema usado
--    en el torneo, tema ya visto por ellos, misma categoría que la última y seed. Si la dificultad (y
--    sus vecinas) se agotó, toma la que vieron hace más tiempo. Nunca falla.
--  * Poda diaria (`tanda-seen-prune`): lo visto hace más de 120 días vuelve al bolillero.
-- ════════════════════════════════════════════════════════════════════════════

create table if not exists public.user_seen_questions (
  user_id uuid not null references auth.users (id) on delete cascade,
  question_id uuid not null references public.questions (id) on delete cascade,
  seen_at timestamptz not null default now(),
  primary key (user_id, question_id)
);
create index if not exists user_seen_questions_seen_at_idx on public.user_seen_questions (seen_at);
create index if not exists user_seen_questions_question_idx on public.user_seen_questions (question_id);
alter table public.user_seen_questions enable row level security;
revoke all on table public.user_seen_questions from public, anon, authenticated;
comment on table public.user_seen_questions is 'Preguntas que vio cada humano (feedback 3 #16). Solo RPC SECURITY DEFINER; poda a 120 días.';

create or replace function public.take_tournament_question(p_tournament uuid, p_difficulty public.difficulty, p_seed bigint)
returns uuid
language plpgsql security definer set search_path to ''
as $$
declare
  v_question uuid; v_order public.difficulty[]; v_diff public.difficulty; v_mode text; v_pool text[];
  v_topics text[]; v_seen_topics text[]; v_last_cat text; v_humans uuid[];
begin
  select mode_id into v_mode from public.tournaments where id = p_tournament;
  -- Ranked: bancos de todos los modos jugables mezclados.
  v_pool := case when v_mode = 'ranked'
    then array(select gm.id from public.game_modes gm where gm.active)
    else array[v_mode] end;

  -- Humanos del torneo (invitados incluidos: son usuarios anónimos reales).
  select coalesce(array_agg(distinct p.user_id), '{}') into v_humans
    from public.participants p where p.tournament_id = p_tournament and p.user_id is not null;

  -- Temas ya usados en el torneo + temas que ya vieron sus humanos + categoría de la última.
  select coalesce(array_agg(distinct q.topic) filter (where q.topic is not null), '{}')
    into v_topics
    from public.tournament_questions tq join public.questions q on q.id = tq.question_id
    where tq.tournament_id = p_tournament;
  select coalesce(array_agg(distinct q.topic) filter (where q.topic is not null), '{}')
    into v_seen_topics
    from public.user_seen_questions s join public.questions q on q.id = s.question_id
    where s.user_id = any(v_humans);
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

  -- 1) Nunca vista por nadie de la sala ni tomada en el torneo.
  foreach v_diff in array v_order loop
    select q.id into v_question
    from public.questions q
    where q.mode_id = any(v_pool) and q.difficulty = v_diff
      and not exists (select 1 from public.tournament_questions tq
                      where tq.tournament_id = p_tournament and tq.question_id = q.id)
      and not exists (select 1 from public.user_seen_questions s
                      where s.user_id = any(v_humans) and s.question_id = q.id)
    order by (q.topic is not null and q.topic = any(v_topics)),
             (q.topic is not null and q.topic = any(v_seen_topics)),
             (q.category is not distinct from v_last_cat),
             md5(p_seed::text || ':' || q.id::text)
    limit 1;
    exit when v_question is not null;
  end loop;

  -- 2) Banco agotado para esta sala: la que vieron hace más tiempo (sin repetir en el torneo).
  if v_question is null then
    select q.id into v_question
    from public.questions q
    left join lateral (
      select max(s.seen_at) as last_seen from public.user_seen_questions s
       where s.user_id = any(v_humans) and s.question_id = q.id
    ) seen on true
    where q.mode_id = any(v_pool) and q.difficulty = any(v_order)
      and not exists (select 1 from public.tournament_questions tq
                      where tq.tournament_id = p_tournament and tq.question_id = q.id)
    order by seen.last_seen nulls first, array_position(v_order, q.difficulty), md5(p_seed::text || ':' || q.id::text)
    limit 1;
  end if;

  -- 3) Torneo que agotó todo el banco: cualquiera de la dificultad.
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

CREATE OR REPLACE FUNCTION public.open_penalty_internal(p_penalty uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_match uuid; v_idx int; v_difficulty public.difficulty;
  v_started timestamptz; v_deadline timestamptz; v_prompt text; v_options jsonb;
  v_kicker uuid; v_keeper uuid;
begin
  update public.penalties
    set status = 'open', started_at = now(), deadline = now() + make_interval(secs => (public.game_timing()->>'penaltyS')::int)
    where id = p_penalty and status = 'pending'
    returning match_id, idx, difficulty, started_at, deadline,
              kicker_participant_id, keeper_participant_id
    into v_match, v_idx, v_difficulty, v_started, v_deadline, v_kicker, v_keeper;
  if v_started is null then return; end if;  -- no estaba pending → no-op

  -- Feedback 3 #16: el pateador y el arquero humanos "vieron" la pregunta (entre torneos no se repite).
  insert into public.user_seen_questions (user_id, question_id, seen_at)
    select p.user_id, pe.question_id, now()
      from public.penalties pe
      join public.participants p on p.id in (pe.kicker_participant_id, pe.keeper_participant_id)
     where pe.id = p_penalty and pe.question_id is not null and p.user_id is not null and not p.is_bot
  on conflict (user_id, question_id) do update set seen_at = excluded.seen_at;

  select q.prompt, q.options into v_prompt, v_options
    from public.questions q join public.penalties pe on pe.question_id = q.id
    where pe.id = p_penalty;

  perform realtime.send(
    jsonb_build_object(
      'penalty_id', p_penalty, 'match_id', v_match, 'idx', v_idx,
      'prompt', v_prompt, 'options', v_options, 'difficulty', v_difficulty,
      'started_at', v_started, 'deadline', v_deadline, 'server_now', now(),
      'kicker_participant_id', v_kicker, 'keeper_participant_id', v_keeper
    ),
    'penal:start', 'match:' || v_match::text, true
  );
  perform public.precompute_bot_intents(p_penalty);
end;
$function$
;

-- Poda diaria (03:30 ART = 06:30 UTC): lo visto hace más de 120 días vuelve a poder salir.
select cron.unschedule('tanda-seen-prune') where exists (select 1 from cron.job where jobname = 'tanda-seen-prune');
select cron.schedule('tanda-seen-prune', '30 6 * * *',
  $cron$delete from public.user_seen_questions where seen_at < now() - interval '120 days'$cron$);
