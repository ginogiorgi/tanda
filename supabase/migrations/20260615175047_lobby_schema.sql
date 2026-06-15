-- Tanda — F4 / tarea 4.1 (esquema): soporte de lobby previo al arranque del torneo.
-- La sala crea room + tournament + participante host de entrada; las naciones/grupos se
-- asignan recién en start_tournament (F5). Por eso:
--   - el torneo necesita un estado previo `pending` (antes de `in_progress`);
--   - el participante en lobby todavía no tiene nación → `nation_id` pasa a ser nullable.

alter type public.tournament_status add value if not exists 'pending' before 'in_progress';

alter table public.participants alter column nation_id drop not null;
