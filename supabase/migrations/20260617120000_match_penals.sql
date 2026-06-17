-- Tanda — F8 / tarea 8.6: penal a penal de un partido (resumen de fin de partido).
--
-- El resumen muestra el marcador final + cada penal (quién pateó, si fue gol). Los datos ya están
-- en `penalties.resolution` (jsonb {scored, winner, reason}); esta RPC los expone ORDENADOS para un
-- match, solo a miembros. `correct_index` no aparece (el penal ya está resuelto, no se necesita acá).
create function public.get_match_penals(p_match uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
begin
  if uid is null then raise exception 'unauthenticated'; end if;
  if not public.is_match_member(p_match) then raise exception 'not_match_member'; end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'idx', pe.idx,
      'kicker_participant_id', pe.kicker_participant_id,
      'scored', (pe.resolution->>'scored')::boolean,
      'reason', pe.resolution->>'reason'
    ) order by pe.idx)
    from public.penalties pe
    where pe.match_id = p_match and pe.status = 'resolved'
  ), '[]'::jsonb);
end;
$$;
grant execute on function public.get_match_penals(uuid) to authenticated;
