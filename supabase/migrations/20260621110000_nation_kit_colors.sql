-- Tanda — corrección fina de colores de kit por nación (T5 del plan de 16).
--
-- El seed (F5.0) ya tenía los 48 colores muy cerca de lo real, salvo un puñado de selecciones cuyo
-- KIT TITULAR 2026 es BLANCO pero estaban cargadas con el color nacional como `kit_primary` (es decir,
-- mostraban de hecho su kit de visitante). La convención del seed para equipos de camiseta blanca ya
-- es `kit_primary = #FFFFFF` (Inglaterra, EE. UU., Alemania, Ghana, Irán, Nueva Zelanda) con el color
-- nacional en `kit_secondary` (la banda diagonal del torso). Esta migración alinea a las rezagadas.
--
-- Verificado por web (kits oficiales 2026: adidas/Puma/Kelme/FIFA Store, jun 2026):
--   · Senegal  → home BLANCO con verde (era verde primario).
--   · Irak     → home BLANCO con verde (era verde primario).
--   · Argelia  → home BLANCO con verde (era verde primario).
--   · Jordania → home BLANCO con rojo, patrón kufiya (era rojo primario).
--   · Arabia Saudita → home VERDE con acento DORADO (estaba liso verde/verde; se le da el 2º color).
--
-- Idempotente (UPDATE por `code`). No toca el resto de las 48 ni el seed original.

-- Camiseta blanca como base, color nacional en la banda (accent = primario, como el resto de las
-- selecciones de blanco del seed).
update public.nations set kit_primary = '#FFFFFF', kit_secondary = '#00853F', accent_color = '#FFFFFF' where code = 'SEN';
update public.nations set kit_primary = '#FFFFFF', kit_secondary = '#2D8A3E', accent_color = '#FFFFFF' where code = 'IRQ';
update public.nations set kit_primary = '#FFFFFF', kit_secondary = '#006633', accent_color = '#FFFFFF' where code = 'ALG';
update public.nations set kit_primary = '#FFFFFF', kit_secondary = '#CE1126', accent_color = '#FFFFFF' where code = 'JOR';

-- Arabia Saudita: home verde con acento dorado (deja de ser camiseta lisa).
update public.nations set kit_secondary = '#C9A227' where code = 'KSA';
