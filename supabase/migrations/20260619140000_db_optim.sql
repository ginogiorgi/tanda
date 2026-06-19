-- Fase C (2026-06-19) — Optimización de DB para 1000+ concurrentes (decisión: dejar el SQL listo;
-- el "switch" de escala = subir el tier de Supabase + pg_cron más frecuente, documentado en SPEC).
--
-- C1: índice de `questions(difficulty)` — hotspot de take_tournament_question (filtra por dificultad
--     recorriendo el banco en cada penal de cada match).
-- C2: índice parcial de `tournaments` activos — lo escanea tick() (round_deadline + advance) cada vuelta.
-- C4: tick() — subir los LIMIT (techo de penales/torneos procesados por vuelta) y reemplazar el
--     `exception when others then null` que tragaba errores por un `raise warning` (mismo aislamiento
--     por fila, pero ahora los fallos quedan en los logs de Postgres en vez de desaparecer).

-- ─────────────────────────────────────────────────────────────────────────────
-- C1 + C2 — índices.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS "questions_difficulty_idx"
  ON "public"."questions" USING "btree" ("difficulty");

CREATE INDEX IF NOT EXISTS "tournaments_in_progress_idx"
  ON "public"."tournaments" USING "btree" ("round_deadline")
  WHERE ("status" = 'in_progress'::"public"."tournament_status");

-- ─────────────────────────────────────────────────────────────────────────────
-- C4 — tick(): más techo por vuelta + logging de fallos (antes se tragaban en silencio).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION "public"."tick"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare r record;
begin
  insert into public.penalty_answers
      (penalty_id, participant_id, option_index, selected_at, is_correct, is_random, phase)
  select bi.penalty_id, bi.participant_id, bi.chosen_option, bi.scheduled_answer_at,
         (bi.chosen_option = q.correct_index), false, bi.phase
  from public.bot_intents bi
  join public.penalties pe on pe.id = bi.penalty_id and pe.status in ('open', 'second_chance')
  join public.questions q on q.id = pe.question_id
  where not bi.materialized and bi.scheduled_answer_at <= now()
  on conflict (penalty_id, participant_id, phase) do nothing;

  update public.bot_intents bi
    set materialized = true
    from public.penalties pe
    where bi.penalty_id = pe.id and pe.status in ('open', 'second_chance')
      and not bi.materialized and bi.scheduled_answer_at <= now();

  -- Techos por vuelta (C4): dimensionados para 1000+ concurrentes (~500 matches → ~500 penales
  -- venciendo juntos). Si se superan, la próxima vuelta de pg_cron limpia el resto. El "switch" de
  -- escala mayor = pg_cron más frecuente / subir estos números (ver SPEC §C).
  for r in
    select id from public.penalties
    where status in ('open', 'second_chance')
      and deadline is not null and deadline <= now()
    order by deadline
    limit 1000
  loop
    begin perform public.resolve_penalty(r.id);
    exception when others then raise warning 'tick resolve_penalty(%) failed: %', r.id, sqlerrm; end;
  end loop;

  -- Tiempo muerto entre rondas vencido → abrir la próxima ronda (backstop del poke del cliente).
  for r in
    select id from public.tournaments
    where status = 'in_progress' and round_deadline is not null and round_deadline <= now()
    limit 500
  loop
    begin perform public.open_next_round(r.id);
    exception when others then raise warning 'tick open_next_round(%) failed: %', r.id, sqlerrm; end;
  end loop;

  for r in
    select id from public.rooms where status = 'lobby' and starts_at <= now() limit 500
  loop
    begin perform public.start_tournament(r.id);
    exception when others then raise warning 'tick start_tournament(%) failed: %', r.id, sqlerrm; end;
  end loop;

  for r in
    select t.id from public.tournaments t
    where t.status = 'in_progress'
      and t.round_deadline is null
      and not exists (
        select 1 from public.matches m
        where m.tournament_id = t.id and m.status in ('in_progress', 'sudden_death')
      )
    limit 500
  loop
    begin perform public.advance_tournament(r.id);
    exception when others then raise warning 'tick advance_tournament(%) failed: %', r.id, sqlerrm; end;
  end loop;
end;
$$;
