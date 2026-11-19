-- Feedback 3 #13 — la cola ranked muestra "N esperando" con Presence de Realtime (canal `ranked:queue`),
-- exacto y sin consultas. `ranked_poll` (el latido, cada 2 s por jugador) deja de hacer el COUNT de la
-- cola: nadie lo lee ya. Mismo cuerpo que en `20261124000002_game_timing.sql` sin `in_queue`.

CREATE OR REPLACE FUNCTION public.ranked_poll()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  uid uuid := (select auth.uid()); v_t uuid; v_enq timestamptz; v_rating int; v_waited float8;
begin
  if uid is null then raise exception 'unauthenticated'; end if;

  v_t := public.ranked_active_tournament(uid);
  if v_t is not null then
    return jsonb_build_object('status', 'matched', 'tournament_id', v_t);
  end if;

  update public.ranked_queue set last_seen = now() where user_id = uid
    returning enqueued_at, rating into v_enq, v_rating;
  if v_enq is null then return jsonb_build_object('status', 'idle'); end if;

  v_t := public.ranked_try_match(uid);
  if v_t is not null then
    return jsonb_build_object('status', 'matched', 'tournament_id', v_t);
  end if;

  v_waited := extract(epoch from now() - v_enq);
  return jsonb_build_object(
    'status', 'queued',
    'waited_ms', (v_waited * 1000)::bigint,
    'rating', v_rating,
    'server_now', now()
  );
end;
$function$
;
