-- Tanda — F4 / tarea 4.1 (fix): resuelve ambigüedades "column reference is ambiguous".
-- En gen_room_code la variable `code` chocaba con la columna `rooms.code`; en join_room el
-- `tournament_id` sin calificar chocaba con la columna de salida homónima. Se califican.

create or replace function public.gen_room_code()
returns text language plpgsql set search_path = '' as $$
declare
  alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_code text;
  i int;
begin
  loop
    v_code := '';
    for i in 1..6 loop
      v_code := v_code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from public.rooms r where r.code = v_code);
  end loop;
  return v_code;
end;
$$;
revoke all on function public.gen_room_code() from public, anon, authenticated;

create or replace function public.join_room(p_code text)
returns table (room_id uuid, tournament_id uuid, code text)
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  v_room uuid;
  v_tournament uuid;
  v_status public.room_status;
  v_count int;
begin
  if uid is null then raise exception 'unauthenticated'; end if;

  select r.id, t.id, r.status into v_room, v_tournament, v_status
    from public.rooms r
    join public.tournaments t on t.room_id = r.id
    where r.code = upper(trim(p_code));

  if v_room is null then raise exception 'room_not_found'; end if;
  if v_status = 'cancelled' then raise exception 'room_cancelled'; end if;
  if v_status <> 'lobby' then raise exception 'already_started'; end if;

  if exists (
    select 1 from public.participants pp
    where pp.tournament_id = v_tournament and pp.user_id = uid
  ) then
    return query select v_room, v_tournament, upper(trim(p_code));
    return;
  end if;

  select count(*) into v_count
    from public.participants pp where pp.tournament_id = v_tournament;
  if v_count >= 48 then raise exception 'room_full'; end if;

  insert into public.participants (tournament_id, user_id, is_bot)
    values (v_tournament, uid, false);

  return query select v_room, v_tournament, upper(trim(p_code));
end;
$$;
grant execute on function public.join_room(text) to authenticated;
