-- Limpieza integral (17/11, pedido de Gino).
--
-- 1) Tablas de backup de migraciones ya consolidadas. Antes del DROP se verificaron los datos vivos (19 perfiles,
--    todos v2 válidos; ranked_players consistente, 0 huérfanos) y se exportaron fuera del repo, con hash de filas
--    verificado contra prod: /mnt/hera/Backups/tanda-db/2026-11-17/<tabla>.sql (DDL + filas, restaurable).
drop table if exists public.profiles_avatar_backup;
drop table if exists public.ranked_players_backup_1411;

-- 2) Compat v1 del avatar fuera: prod es 100% v2 y el CHECK `profiles_avatar_v2` impide guardar otra cosa. El alta
--    de usuario sigue pasando por `avatar_to_v2`, que ahora solo deja pasar un v2 válido (normalizando mujer+rapado
--    → cola, como `parseAvatar`) y manda cualquier otra cosa al default. Las helpers del port v1 (paleta, Lab,
--    color más cercano) quedan sin uso.
create or replace function public.avatar_to_v2(p jsonb)
returns jsonb
language sql immutable set search_path to ''
as $$
  select case
    when not public.avatar_is_valid(p) then public.avatar_default()
    when p ->> 'body' = 'female' and p #>> '{hair,style}' = 'buzz' then jsonb_set(p, '{hair,style}', '"ponytail"')
    else p
  end;
$$;

revoke execute on function public.avatar_to_v2(jsonb) from public, anon, authenticated;

drop function if exists public.avatar_nearest(text, jsonb, text);
drop function if exists public.avatar_hex_lab(text);
drop function if exists public.avatar_palette(text);
