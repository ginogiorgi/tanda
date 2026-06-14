-- Tanda — F2 / tarea 2.1: profiles + auth username (email sintético). Ver SPEC §2.
-- username es text con índice único case-insensitive (sin extensión en public).

create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  username    text not null,
  avatar      jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint username_format check (username ~ '^[a-zA-Z0-9_]{3,20}$')
);

create unique index profiles_username_lower_key on public.profiles (lower(username));

comment on table public.profiles is 'Perfil público del usuario. username = nombre en juego.';

alter table public.profiles enable row level security;

-- Lectura: por ahora solo el propio perfil (co-participantes se habilitan en F4).
-- (select auth.uid()) cachea la llamada por statement → mejor performance de RLS.
create policy "profiles_select_own"
  on public.profiles for select
  using ((select auth.uid()) = id);

create policy "profiles_update_own"
  on public.profiles for update
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- Sin policy de INSERT/DELETE: el profile lo crea el trigger (SECURITY DEFINER).

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- Crea el profile al registrarse (toma username/avatar del metadata del signup).
-- search_path = '' + referencias calificadas (public.profiles) = seguro.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, username, avatar)
  values (
    new.id,
    new.raw_user_meta_data ->> 'username',
    coalesce(new.raw_user_meta_data -> 'avatar', '{}'::jsonb)
  );
  return new;
end;
$$;

-- Las funciones de trigger no se exponen por RPC.
revoke execute on function public.set_updated_at() from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
