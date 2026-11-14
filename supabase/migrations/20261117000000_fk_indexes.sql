-- Fase 7: índices de las FKs que marcó el advisor de performance (borrados en cascada y joins).
create index if not exists ranked_matches_home_participant_idx on public.ranked_matches (home_participant);
create index if not exists ranked_matches_away_participant_idx on public.ranked_matches (away_participant);
create index if not exists ranked_matches_season_idx on public.ranked_matches (season_id);
create index if not exists ranked_season_results_season_idx on public.ranked_season_results (season_id);
create index if not exists tournaments_mode_idx on public.tournaments (mode_id);
