-- Tanda — F5 / tarea 5.2: `start_tournament` (esqueleto). Arma el torneo de 48 a partir del
-- lobby (SPEC §4, §5): reparte humanos 1 por grupo (round-robin), rellena con bots, asigna las
-- 48 naciones (una por participante, sin repetir, sorteo por seed), arma 12 grupos de 4 y el
-- fixture round-robin (6 partidos por grupo = 72), marca `is_bot_only`, y pone el torneo
-- `in_progress`. Corre en plpgsql (decisión SPEC §1.2/§4.5): sus disparadores son in-DB
-- (join_room al llegar a 48; tick()/cron al vencer el countdown) → sin Edge/HTTP.
--
-- DEFERIDO (no es parte de este esqueleto): crear los penales de la 1ª jornada (necesita el
-- banco de preguntas, F7) y simular los bot-vs-bot + abrir la 1ª jornada (6.4). Acá los matches
-- quedan `pending`. Si 0 humanos → cancela la sala (no se arma torneo).
--
-- No es client-callable (lo invocan join_room / tick, que corren como owner): revoke a todos.
create function public.start_tournament(p_room uuid)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_letters constant text[] := array['A','B','C','D','E','F','G','H','I','J','K','L'];
  v_tournament uuid;
  v_seed bigint;
  v_humans int;
begin
  -- Lock del torneo del room; claim optimista pending→(seguir). Si no está pending, ya arrancó.
  select t.id, t.seed into v_tournament, v_seed
    from public.tournaments t
    where t.room_id = p_room and t.status = 'pending'
    for update skip locked;
  if v_tournament is null then return; end if;  -- ya arrancado / lockeado por otro

  select count(*) into v_humans
    from public.participants where tournament_id = v_tournament and is_bot = false;

  -- Sin humanos → no se arma torneo, se cancela la sala.
  if v_humans = 0 then
    update public.rooms set status = 'cancelled' where id = p_room;
    return;
  end if;

  update public.rooms set status = 'starting' where id = p_room;

  -- 1) Humanos: 1 por grupo, round-robin (A,B,…,L,A,…). Con ≤12 humanos, uno por grupo distinto.
  with h as (
    select id, row_number() over (order by created_at, id) as rn
    from public.participants
    where tournament_id = v_tournament and is_bot = false
  )
  update public.participants p
    set group_letter = v_letters[((h.rn - 1) % 12) + 1]
    from h where p.id = h.id;

  -- 2) Relleno con bots hasta 4 por grupo (48 - humanos en total).
  insert into public.participants (tournament_id, user_id, is_bot, group_letter)
  select v_tournament, null, true, g.letter
  from (select unnest(v_letters) as letter) g
  cross join lateral generate_series(
    1,
    4 - (select count(*) from public.participants
         where tournament_id = v_tournament and group_letter = g.letter)
  );

  -- 3) Naciones: las 48, una por participante, sin repetir. Sorteo determinista por seed
  --    (empareja por row_number de dos órdenes barajados por md5(seed||id)).
  with parts as (
    select id, row_number() over (order by md5(v_seed::text || ':' || id::text)) as rn
    from public.participants where tournament_id = v_tournament
  ),
  nats as (
    select id as nation_id, row_number() over (order by md5(v_seed::text || ':' || id::text)) as rn
    from public.nations
  )
  update public.participants p
    set nation_id = nats.nation_id
    from parts join nats on nats.rn = parts.rn
    where p.id = parts.id;

  -- 4) Fixture: round-robin de 4 por grupo (6 partidos, 3 jornadas). bracket_slot = jornada.
  --    Posiciones 1-4 barajadas por seed; pares fijos del round-robin de 4.
  with ps as (
    select id, group_letter, is_bot,
           row_number() over (
             partition by group_letter order by md5(v_seed::text || ':' || id::text)
           ) as rn
    from public.participants where tournament_id = v_tournament
  )
  insert into public.matches
    (tournament_id, phase, group_letter, bracket_slot,
     home_participant_id, away_participant_id, is_bot_only, status)
  select v_tournament, 'group', h.group_letter, pair.md,
         h.id, a.id, (h.is_bot and a.is_bot), 'pending'
  from (values (1,4,1),(2,3,1),(1,3,2),(4,2,2),(1,2,3),(3,4,3)) as pair(hr, ar, md)
  join ps h on h.rn = pair.hr
  join ps a on a.rn = pair.ar and a.group_letter = h.group_letter;

  -- 5) Torneo en curso. Los matches quedan pending hasta que 6.4 abra la 1ª jornada.
  update public.tournaments set status = 'in_progress', current_phase = 'groups'
    where id = v_tournament;
  update public.rooms set status = 'in_progress' where id = p_room;
end;
$$;
revoke all on function public.start_tournament(uuid) from public, anon, authenticated;
