-- Avatar v2 (feedback 2, P7c): migra `profiles.avatar` de v1 (`{bodyType, hair{part,color}, top, bottom,
-- shoes}`, colores libres) a v2 (`{v:2, body, skin, hair{style,color}, kit{shirt,shorts}, boots{color}}`,
-- colores de las paletas curadas). El front ya lee las dos (P7b, `parseAvatar`).
--
-- `avatar_to_v2` es un PORT FIEL de `migrateAvatar` (lib/avatar/schema.ts): mismas paletas (paridad con
-- lib/avatar/palette.ts), mismo mapeo de peinados y mismo color más cercano (CIE76 en Lab D65). Lo verifica
-- `supabase/tests/avatar_v2.test.ts` contra el TS con los avatares reales de prod + 2000 casos al azar.
-- Reversible: backup en `profiles_avatar_backup`.

-- ───────────── paletas (== lib/avatar/palette.ts; paridad en el test) ─────────────
create or replace function public.avatar_palette(p_kind text)
returns text[]
language sql immutable set search_path to ''
as $$
  select case p_kind
    when 'hair' then array['#1E1B19','#3A2A20','#5B3E2B','#80593B','#A07D4E','#CFAE76','#8C3F24','#A9A6A0']
    when 'skin' then array['#F2D3BC','#E0B593','#C68E66','#A06B45','#764A2E','#4D3020']
    when 'kit' then array['#1C1C1C','#ECE6D8','#8A8984','#1F2B47','#2C4A9A','#8FB2D3','#A8352B','#6B2433','#2E5A3C','#C4A042']
    when 'boots' then array['#1C1C1C','#ECE6D8','#A8352B','#2C4A9A','#C4A042','#8A8984']
  end;
$$;

-- sRGB hex → CIELAB (D65), igual que `hexToLab`.
create or replace function public.avatar_hex_lab(p_hex text)
returns float8[]
language plpgsql immutable set search_path to ''
as $$
declare
  n int := ('x' || substr(p_hex, 2, 6))::bit(24)::int;
  c float8[] := array[(n >> 16) & 255, (n >> 8) & 255, n & 255];
  lin float8[] := '{}';
  s float8; x float8; y float8; z float8;
  fx float8; fy float8; fz float8;
begin
  foreach s in array c loop
    s := s / 255;
    lin := lin || (case when s <= 0.04045 then s / 12.92 else power((s + 0.055) / 1.055, 2.4) end);
  end loop;
  x := (0.4124 * lin[1] + 0.3576 * lin[2] + 0.1805 * lin[3]) / 0.95047;
  y := 0.2126 * lin[1] + 0.7152 * lin[2] + 0.0722 * lin[3];
  z := (0.0193 * lin[1] + 0.1192 * lin[2] + 0.9505 * lin[3]) / 1.08883;
  fx := case when x > 216.0 / 24389 then cbrt(x) else (24389.0 / 27 * x + 16) / 116 end;
  fy := case when y > 216.0 / 24389 then cbrt(y) else (24389.0 / 27 * y + 16) / 116 end;
  fz := case when z > 216.0 / 24389 then cbrt(z) else (24389.0 / 27 * z + 16) / 116 end;
  return array[116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
end;
$$;

-- Color del campo: el de la paleta si está (en su grafía), el más cercano si es un hex, si no el default.
-- Empate → el primero de la paleta (como `nearestSwatch`).
create or replace function public.avatar_nearest(p_kind text, p_raw jsonb, p_default text)
returns text
language plpgsql immutable set search_path to ''
as $$
declare
  pal text[] := public.avatar_palette(p_kind);
  h text; best text; d float8; bd float8 := 'Infinity'; a float8[]; b float8[];
begin
  if p_raw is null or jsonb_typeof(p_raw) <> 'string' then return p_default; end if;
  h := p_raw #>> '{}';
  foreach best in array pal loop
    if lower(best) = lower(h) then return best; end if;
  end loop;
  if h !~ '^#[0-9a-fA-F]{6}$' then return p_default; end if;
  a := public.avatar_hex_lab(h);
  best := null;
  for i in 1 .. array_length(pal, 1) loop
    b := public.avatar_hex_lab(pal[i]);
    d := sqrt(power(a[1] - b[1], 2) + power(a[2] - b[2], 2) + power(a[3] - b[3], 2));
    if d < bd then bd := d; best := pal[i]; end if;
  end loop;
  return best;
end;
$$;

create or replace function public.avatar_default()
returns jsonb
language sql immutable set search_path to ''
as $$
  select '{"v":2,"body":"male","skin":"#A06B45","hair":{"style":"parted","color":"#3A2A20"},"kit":{"shirt":"#A8352B","shorts":"#1F2B47"},"boots":{"color":"#1C1C1C"}}'::jsonb;
$$;

-- Forma mínima de v2 (el detalle lo valida el front con el catálogo).
create or replace function public.avatar_is_valid(p jsonb)
returns boolean
language sql immutable set search_path to ''
as $$
  select coalesce(
    jsonb_typeof(p) = 'object'
    and p ->> 'v' = '2'
    and p ->> 'body' in ('male', 'female')
    and jsonb_typeof(p -> 'skin') = 'string'
    and jsonb_typeof(p #> '{hair,style}') = 'string'
    and jsonb_typeof(p #> '{hair,color}') = 'string'
    and jsonb_typeof(p #> '{kit,shirt}') = 'string'
    and jsonb_typeof(p #> '{kit,shorts}') = 'string'
    and jsonb_typeof(p #> '{boots,color}') = 'string',
    false);
$$;

-- v1 → v2 (port de `migrateAvatar`); un v2 válido pasa tal cual; cualquier otra cosa → default.
create or replace function public.avatar_to_v2(p jsonb)
returns jsonb
language plpgsql immutable set search_path to ''
as $$
declare
  d jsonb := public.avatar_default();
  v_body text; v_style text;
begin
  if public.avatar_is_valid(p) then return p; end if;
  if p is null or jsonb_typeof(p) <> 'object' or not (p ? 'bodyType') then return d; end if;
  v_body := case when p ->> 'bodyType' = 'female' then 'female' else 'male' end;
  v_style := case p #>> '{hair,part}'
    when 'none' then 'none' when 'buzz' then 'buzz' when 'mohawk' then 'buzz'
    when 'short' then 'parted' when 'long' then 'long' when 'bun' then 'bun'
    else 'parted' end;
  -- el corto no se ofrece en la cabeza F (QA de P7a) → su fallback, el rodete
  if v_body = 'female' and v_style = 'parted' then v_style := 'bun'; end if;
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

revoke execute on function public.avatar_palette(text), public.avatar_hex_lab(text),
  public.avatar_nearest(text, jsonb, text), public.avatar_default(), public.avatar_is_valid(jsonb),
  public.avatar_to_v2(jsonb)
  from public, anon, authenticated;

-- ───────────── backup + migración ─────────────
create table if not exists public.profiles_avatar_backup (
  id uuid primary key,
  avatar jsonb not null,
  migrated_at timestamptz not null default now()
);
alter table public.profiles_avatar_backup enable row level security;
revoke all on public.profiles_avatar_backup from anon, authenticated;

insert into public.profiles_avatar_backup (id, avatar)
select id, avatar from public.profiles where not public.avatar_is_valid(avatar)
on conflict (id) do nothing;

update public.profiles set avatar = public.avatar_to_v2(avatar) where not public.avatar_is_valid(avatar);

alter table public.profiles alter column avatar set default public.avatar_default();
alter table public.profiles add constraint profiles_avatar_v2 check (public.avatar_is_valid(avatar));

-- Alta de usuario: lo que mande el cliente (v2, o v1 de un front viejo en caché) pasa por avatar_to_v2.
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path to ''
as $$
begin
  insert into public.profiles (id, username, avatar)
  values (
    new.id,
    new.raw_user_meta_data ->> 'username',
    public.avatar_to_v2(new.raw_user_meta_data -> 'avatar')
  );
  return new;
end;
$$;

-- Ranked (sin nación): el kit sale del avatar → lee v2.
create or replace function public.participant_brief(p_part uuid)
returns jsonb
language sql stable security definer set search_path to ''
as $$
  select jsonb_build_object(
    'participant_id', p.id,
    'user_id', p.user_id,
    'is_bot', p.is_bot,
    'team_id', p.team_id,
    'team_code', coalesce(tm.code, upper(left(pr.username, 3))),
    'team_name', coalesce(tm.name, pr.username),
    'team_short', coalesce(tm.short_name, pr.username),
    'flag', tm.flag_asset,
    'crest', coalesce(tm.crest_asset,
      case when tm.id is null and rp.user_id is not null
        then 'div/' || public.ranked_division_id(public.ranked_division(rp.rating)) end),
    'kit_primary', coalesce(tm.kit_primary, pr.avatar #>> '{kit,shirt}', '#1F3FA8'),
    'kit_secondary', coalesce(tm.kit_secondary, pr.avatar #>> '{kit,shorts}', '#141414'),
    'kit_tertiary', tm.kit_tertiary,
    'kit_pattern', coalesce(tm.kit_pattern::text, 'solid'),
    'accent', coalesce(tm.accent_color, pr.avatar #>> '{kit,shirt}', '#1F3FA8')
  )
  from public.participants p
  left join public.teams tm on tm.id = p.team_id
  left join public.profiles pr on pr.id = p.user_id and p.team_id is null
  left join public.ranked_players rp on rp.user_id = p.user_id and p.team_id is null
  where p.id = p_part;
$$;
