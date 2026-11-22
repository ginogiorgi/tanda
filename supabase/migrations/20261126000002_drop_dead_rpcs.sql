-- Feedback 4 · A3 — funciones muertas.
--  · open_penalty(uuid): RPC de cliente heredada (abría un penal a pedido). El cliente ya no la usa
--    (los penales los abre el server en open_round_penals) y seguía ejecutable por `authenticated`:
--    un miembro podía abrir un penal a destiempo. Superficie de ataque sin uso → fuera.
--  · penalty_all_answered(uuid, answer_phase): helper del cierre anticipado, que se deshizo en
--    Feedback 3 #2 (el penal se resuelve solo al vencer el tiempo). Sin llamadores.
drop function if exists public.open_penalty(uuid);
drop function if exists public.penalty_all_answered(uuid, public.answer_phase);
