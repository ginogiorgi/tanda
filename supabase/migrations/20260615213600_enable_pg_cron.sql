-- Tanda — habilita pg_cron (agendador). Lo usa el janitor de salas (cleanup_stale_rooms) y,
-- más adelante, el tick() backstop de penales/rooms (4.7).
create extension if not exists pg_cron;
