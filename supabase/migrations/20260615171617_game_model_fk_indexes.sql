-- Tanda — F3 / tarea 3.1: índices de cobertura para las foreign keys del modelo de juego.
-- Mejoran joins por participante/pregunta y, sobre todo, el rendimiento de los ON DELETE
-- CASCADE (borrar un torneo limpia participants→matches→penalties→answers/intents).
-- Aparece como `unused_index` hasta que haya tráfico; se usan al correr el torneo.

create index bot_intents_participant_idx     on public.bot_intents (participant_id);
create index matches_home_participant_idx    on public.matches (home_participant_id);
create index matches_away_participant_idx    on public.matches (away_participant_id);
create index matches_winner_participant_idx  on public.matches (winner_participant_id);
create index participants_nation_idx         on public.participants (nation_id);
create index penalties_kicker_participant_idx on public.penalties (kicker_participant_id);
create index penalties_keeper_participant_idx on public.penalties (keeper_participant_id);
create index penalties_question_idx          on public.penalties (question_id);
create index penalty_answers_participant_idx on public.penalty_answers (participant_id);
create index rooms_host_idx                  on public.rooms (host_id);
create index tournament_questions_question_idx on public.tournament_questions (question_id);
create index tournaments_champion_idx        on public.tournaments (champion_participant_id);
create index tournaments_third_place_idx     on public.tournaments (third_place_participant_id);
