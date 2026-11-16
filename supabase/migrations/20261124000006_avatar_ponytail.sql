-- Peinados de mujer (pedido de Gino 16/11): el rapado sale del cuerpo F y entra la cola de caballo
-- (`ponytail`, malla generada en components/avatar/glbPonytail.ts). En el catálogo (lib/avatar/catalog.ts)
-- `buzz` queda solo para H con `fallback: "ponytail"` → `hairFor('buzz','female') = 'ponytail'`.
--
-- `avatar_to_v2` sigue siendo PORT FIEL de `migrateAvatar` (v1 F con rapado/mohicano → cola) y además
-- normaliza un v2 F+rapado (front viejo en caché, alta de usuario) como `parseAvatar`.
-- Datos: en prod NO había perfiles F+rapado al escribir esto (0 de 18, 16/11); el UPDATE queda por si
-- aparece alguno entre el deploy del front y esta migración. Backup en `profiles_avatar_backup`.

create or replace function public.avatar_to_v2(p jsonb)
returns jsonb
language plpgsql immutable set search_path to ''
as $$
declare
  d jsonb := public.avatar_default();
  v_body text; v_style text;
begin
  if public.avatar_is_valid(p) then
    if p ->> 'body' = 'female' and p #>> '{hair,style}' = 'buzz' then
      return jsonb_set(p, '{hair,style}', '"ponytail"');
    end if;
    return p;
  end if;
  if p is null or jsonb_typeof(p) <> 'object' or not (p ? 'bodyType') then return d; end if;
  v_body := case when p ->> 'bodyType' = 'female' then 'female' else 'male' end;
  v_style := case p #>> '{hair,part}'
    when 'none' then 'none' when 'buzz' then 'buzz' when 'mohawk' then 'buzz'
    when 'short' then 'parted' when 'long' then 'long' when 'bun' then 'bun'
    else 'parted' end;
  -- fallbacks del catálogo en la cabeza F: el corto → rodete, el rapado → cola
  if v_body = 'female' and v_style = 'parted' then v_style := 'bun'; end if;
  if v_body = 'female' and v_style = 'buzz' then v_style := 'ponytail'; end if;
  return jsonb_build_object(
    'v', 2,
    'body', v_body,
    'skin', '#A06B45',
    'hair', jsonb_build_object('style', v_style, 'color', public.avatar_nearest('hair', p #> '{hair,color}', d #>> '{hair,color}')),
    'kit', jsonb_build_object(
      'shirt', public.avatar_nearest('kit', p #> '{top,color}', d #>> '{kit,shirt}'),
      'shorts', public.avatar_nearest('kit', p #> '{bottom,color}', d #>> '{kit,shorts}')),
    'boots', jsonb_build_object('color', public.avatar_nearest('boots', p #> '{shoes,color}', d #>> '{boots,color}'))
  );
end;
$$;

revoke execute on function public.avatar_to_v2(jsonb) from public, anon, authenticated;

insert into public.profiles_avatar_backup (id, avatar)
select id, avatar from public.profiles
where avatar ->> 'body' = 'female' and avatar #>> '{hair,style}' = 'buzz'
on conflict (id) do nothing;

update public.profiles set avatar = jsonb_set(avatar, '{hair,style}', '"ponytail"')
where avatar ->> 'body' = 'female' and avatar #>> '{hair,style}' = 'buzz';
