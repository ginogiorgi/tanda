-- Tanda — B1: remera de dos colores (banda diagonal cruzada) en la escena 3D del penal.
--
-- Problema: el modelo 3D pintaba la remera con un solo color (kit_primary), así que dos selecciones
-- de color parecido (ej. dos celestes) parecían tener la misma camiseta. Solución: la remera ahora
-- lleva una banda diagonal cruzada con `kit_secondary`. La "raya cruzada" es una estilización del
-- juego aplicada a TODAS las selecciones (no réplica literal del kit) para maximizar la diferenciación.
--
-- Los colores ya estaban curados y son verídicos (auditados en F10/10.1): kit_primary = color de
-- camiseta, kit_secondary = segundo color característico (franja/detalle real). Acá:
--   (1) `participant_brief` pasa a exponer `kit_secondary` al cliente (antes no viajaba).
--   (2) Caso "lisa": las selecciones sin segundo color característico llevan kit_secondary = kit_primary
--       → la banda se funde y la remera parece lisa. Ej. del owner: Arabia Saudita (verde solo).

-- (1) participant_brief: sumar kit_secondary (port fiel del baseline + el campo nuevo).
create or replace function public.participant_brief(p_part uuid) returns jsonb
    language sql stable security definer
    set search_path to ''
    as $$
  select jsonb_build_object(
    'participant_id', p.id,
    'user_id', p.user_id,
    'is_bot', p.is_bot,
    'nation_id', p.nation_id,
    'nation_code', n.code,
    'nation_name', n.name,
    'flag', n.flag_asset,
    'kit_primary', n.kit_primary,
    'kit_secondary', n.kit_secondary,
    'accent', n.accent_color
  )
  from public.participants p
  left join public.nations n on n.id = p.nation_id
  where p.id = p_part;
$$;

revoke all on function public.participant_brief(uuid) from public;
revoke all on function public.participant_brief(uuid) from anon;

-- (2) Caso "lisa" (sin segundo color característico): banda = color base → remera lisa.
update public.nations set kit_secondary = kit_primary where code in ('KSA');
