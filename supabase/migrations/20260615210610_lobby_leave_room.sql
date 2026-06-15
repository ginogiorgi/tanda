-- Tanda — F4 / tarea 4.2: leave_room — salida explícita del lobby + cancelación de sala sin
-- humanos.
--
-- Al salir del lobby, el participante humano borra su fila. Si con eso no queda ningún humano,
-- la sala pasa a 'cancelled' (autoritativo por DB, ver SPEC §2.1). El abandono "sucio" (cerrar
-- la pestaña sin tocar Salir) deja la fila y lo barre el tick() de pg_cron (tarea 4.7); Presence
-- igual refleja al desconectado en vivo en la UI. Solo aplica en 'lobby': salir de un torneo en
-- curso es "Abandonar" (bot por nación) y es F5.
create function public.leave_room(p_code text)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  v_room uuid;
  v_tournament uuid;
  v_status public.room_status;
  v_humans int;
begin
  if uid is null then raise exception 'unauthenticated'; end if;

  select r.id, t.id, r.status into v_room, v_tournament, v_status
    from public.rooms r
    join public.tournaments t on t.room_id = r.id
    where r.code = upper(trim(p_code));

  if v_room is null then return; end if;        -- nada que hacer → idempotente
  if v_status <> 'lobby' then return; end if;   -- in_progress = Abandonar (F5), no se sale así

  delete from public.participants
    where tournament_id = v_tournament and user_id = uid and is_bot = false;

  select count(*) into v_humans
    from public.participants
    where tournament_id = v_tournament and is_bot = false;

  if v_humans = 0 then
    update public.rooms set status = 'cancelled' where id = v_room and status = 'lobby';
  end if;
end;
$$;
grant execute on function public.leave_room(text) to authenticated;
