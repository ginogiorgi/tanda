-- Tanda — F2 / tarea 2.5: chequeo de username disponible en el registro.
-- La RLS de profiles solo permite leer el propio perfil, así que un SELECT anónimo no
-- puede saber si un username ajeno ya existe. Este RPC SECURITY DEFINER expone SOLO un
-- booleano (no filtra datos del perfil) y corre con search_path = '' (seguro).
-- Enumeración de usernames es de bajo riesgo: en juego los usernames son públicos.

create function public.username_available(check_name text)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select not exists (
    select 1 from public.profiles where lower(username) = lower(trim(check_name))
  );
$$;

comment on function public.username_available(text) is
  'True si el username está libre (case-insensitive). Usado en el registro.';

-- Invocable por anónimos (registro) y autenticados.
grant execute on function public.username_available(text) to anon, authenticated;
