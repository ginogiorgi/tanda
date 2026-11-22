-- Feedback 4 F: el aviso del watchdog (`ops_notify_poke`) usa pg_net. El baseline lo declara, pero en prod la
-- extensión no estaba creada (drift: el cron `tanda-ops-notify` fallaba con `schema "net" does not exist`).
create extension if not exists pg_net with schema extensions;
