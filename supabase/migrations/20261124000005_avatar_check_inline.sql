-- Fix de P7c: el CHECK `profiles_avatar_v2` llamaba a `public.avatar_is_valid`, que no es ejecutable por
-- `authenticated` (revocada a propósito: no es una RPC). Un CHECK corre con los permisos de quien escribe →
-- TODO update de `profiles` desde el cliente fallaba (guardar avatar, upgrade de invitado que cambia el
-- username). La forma mínima va inline en el CHECK: sin función, sin abrir superficie. `coalesce(…, false)`:
-- un CHECK que evalúa a NULL PASA (un v1 sin `v` daba NULL).
alter table public.profiles drop constraint profiles_avatar_v2;
alter table public.profiles add constraint profiles_avatar_v2 check (coalesce(
  jsonb_typeof(avatar) = 'object'
  and avatar ->> 'v' = '2'
  and avatar ->> 'body' in ('male', 'female')
  and jsonb_typeof(avatar -> 'skin') = 'string'
  and jsonb_typeof(avatar #> '{hair,style}') = 'string'
  and jsonb_typeof(avatar #> '{hair,color}') = 'string'
  and jsonb_typeof(avatar #> '{kit,shirt}') = 'string'
  and jsonb_typeof(avatar #> '{kit,shorts}') = 'string'
  and jsonb_typeof(avatar #> '{boots,color}') = 'string',
  false));
