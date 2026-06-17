-- Tanda — F10 / 10.1: reseed de `nations` con las 48 SELECCIONES CLASIFICADAS al Mundial 2026.
--
-- El seed original (5.0) usaba el top-48 del ranking FIFA como proxy verificable, pero eso mete
-- países que NO clasificaron (Italia, Rusia, etc.). El owner quiere exclusivamente los 48 clasificados.
-- Fuente: lista oficial de clasificados (FIFA / Wikipedia, jun 2026): 3 anfitriones + 9 AFC + 10 CAF +
-- 3 Concacaf + 6 Conmebol + 1 OFC + 16 UEFA = 48.
--
-- `fifa_rank` acá = orden de siembra (1..48) por fuerza relativa aproximada SOLO entre los clasificados
-- (para el tiering, no es el ranking FIFA global). `difficulty_tier` por banda §7.2: elite (1-10) /
-- high (11-20) / medium (21-30) / low (31-48) → 10/10/10/18, igual que antes. kit_primary tiñe el
-- avatar en el penal; flag_asset = ISO-2 (gb-eng/sct/wls para UK).
--
-- `nations` está referenciada por participants.nation_id → para reemplazar el set hay que liberar esas
-- FKs. Pre-launch (sin usuarios reales): limpiamos la data de juego de prueba con TRUNCATE ... CASCADE
-- desde `rooms` (arrastra tournaments→participants→matches→penalties→answers/intents/tournament_questions)
-- y después reseteamos nations. En un `db reset` desde cero el truncate es no-op.

truncate table public.rooms cascade;
delete from public.nations;

insert into public.nations (code, name, fifa_rank, difficulty_tier, accent_color, flag_asset, kit_primary, kit_secondary) values
  -- ELITE (1-10)
  ('ARG', 'Argentina',           1,  'elite',  '#75AADB', 'ar',     '#75AADB', '#FFFFFF'),
  ('FRA', 'Francia',             2,  'elite',  '#1E3A8A', 'fr',     '#1E3A8A', '#FFFFFF'),
  ('ESP', 'España',              3,  'elite',  '#C60B1E', 'es',     '#C60B1E', '#FFC400'),
  ('ENG', 'Inglaterra',          4,  'elite',  '#FFFFFF', 'gb-eng', '#FFFFFF', '#001E62'),
  ('BRA', 'Brasil',              5,  'elite',  '#FFDF00', 'br',     '#FFDF00', '#009C3B'),
  ('POR', 'Portugal',            6,  'elite',  '#C8102E', 'pt',     '#C8102E', '#006600'),
  ('NED', 'Países Bajos',        7,  'elite',  '#F36C21', 'nl',     '#F36C21', '#FFFFFF'),
  ('BEL', 'Bélgica',             8,  'elite',  '#E30613', 'be',     '#E30613', '#FFD700'),
  ('GER', 'Alemania',            9,  'elite',  '#FFFFFF', 'de',     '#FFFFFF', '#000000'),
  ('CRO', 'Croacia',             10, 'elite',  '#FF0000', 'hr',     '#FF0000', '#FFFFFF'),
  -- HIGH (11-20)
  ('MAR', 'Marruecos',           11, 'high',   '#C1272D', 'ma',     '#C1272D', '#006233'),
  ('COL', 'Colombia',            12, 'high',   '#FCD116', 'co',     '#FCD116', '#003893'),
  ('URU', 'Uruguay',             13, 'high',   '#5CBFEB', 'uy',     '#5CBFEB', '#001E62'),
  ('NOR', 'Noruega',             14, 'high',   '#BA0C2F', 'no',     '#BA0C2F', '#00205B'),
  ('USA', 'EE. UU.',             15, 'high',   '#FFFFFF', 'us',     '#FFFFFF', '#002868'),
  ('MEX', 'México',              16, 'high',   '#006847', 'mx',     '#006847', '#FFFFFF'),
  ('SUI', 'Suiza',               17, 'high',   '#D52B1E', 'ch',     '#D52B1E', '#FFFFFF'),
  ('JPN', 'Japón',               18, 'high',   '#000080', 'jp',     '#000080', '#FFFFFF'),
  ('SEN', 'Senegal',             19, 'high',   '#00853F', 'sn',     '#00853F', '#FFFFFF'),
  ('KOR', 'República de Corea',  20, 'high',   '#CD2E3A', 'kr',     '#CD2E3A', '#001E62'),
  -- MEDIUM (21-30)
  ('ECU', 'Ecuador',             21, 'medium', '#FFD100', 'ec',     '#FFD100', '#0072CE'),
  ('AUT', 'Austria',             22, 'medium', '#ED2939', 'at',     '#ED2939', '#FFFFFF'),
  ('AUS', 'Australia',           23, 'medium', '#FFCD00', 'au',     '#FFCD00', '#00843D'),
  ('TUR', 'Turquía',             24, 'medium', '#E30A17', 'tr',     '#E30A17', '#FFFFFF'),
  ('EGY', 'Egipto',              25, 'medium', '#CE1126', 'eg',     '#CE1126', '#FFFFFF'),
  ('CIV', 'Costa de Marfil',     26, 'medium', '#FF7F00', 'ci',     '#FF7F00', '#009E60'),
  ('CAN', 'Canadá',              27, 'medium', '#D80621', 'ca',     '#D80621', '#FFFFFF'),
  ('SWE', 'Suecia',              28, 'medium', '#FECC00', 'se',     '#FECC00', '#006AA7'),
  ('ALG', 'Argelia',             29, 'medium', '#006633', 'dz',     '#006633', '#FFFFFF'),
  ('TUN', 'Túnez',               30, 'medium', '#E70013', 'tn',     '#E70013', '#FFFFFF'),
  -- LOW (31-48)
  ('QAT', 'Catar',               31, 'low',    '#8A1538', 'qa',     '#8A1538', '#FFFFFF'),
  ('KSA', 'Arabia Saudita',      32, 'low',    '#006C35', 'sa',     '#006C35', '#FFFFFF'),
  ('IRN', 'RI de Irán',          33, 'low',    '#FFFFFF', 'ir',     '#FFFFFF', '#239F40'),
  ('IRQ', 'Irak',                34, 'low',    '#2D8A3E', 'iq',     '#2D8A3E', '#FFFFFF'),
  ('UZB', 'Uzbekistán',          35, 'low',    '#2266CC', 'uz',     '#2266CC', '#FFFFFF'),
  ('JOR', 'Jordania',            36, 'low',    '#CE1126', 'jo',     '#CE1126', '#FFFFFF'),
  ('GHA', 'Ghana',               37, 'low',    '#FFFFFF', 'gh',     '#FFFFFF', '#CE1126'),
  ('RSA', 'Sudáfrica',           38, 'low',    '#FFB915', 'za',     '#FFB915', '#007A4D'),
  ('PAR', 'Paraguay',            39, 'low',    '#DA121A', 'py',     '#DA121A', '#0038A8'),
  ('SCO', 'Escocia',             40, 'low',    '#002663', 'gb-sct', '#002663', '#FFFFFF'),
  ('CZE', 'Chequia',             41, 'low',    '#D7141A', 'cz',     '#D7141A', '#11457E'),
  ('BIH', 'Bosnia y Herzegovina', 42, 'low',   '#002F6C', 'ba',     '#002F6C', '#FFD700'),
  ('COD', 'RD Congo',            43, 'low',    '#007FFF', 'cd',     '#007FFF', '#F7D618'),
  ('CPV', 'Cabo Verde',          44, 'low',    '#003893', 'cv',     '#003893', '#FFFFFF'),
  ('NZL', 'Nueva Zelanda',       45, 'low',    '#FFFFFF', 'nz',     '#FFFFFF', '#000000'),
  ('CUW', 'Curazao',             46, 'low',    '#002B7F', 'cw',     '#002B7F', '#FFD100'),
  ('HAI', 'Haití',               47, 'low',    '#00209F', 'ht',     '#00209F', '#D21034'),
  ('PAN', 'Panamá',              48, 'low',    '#D21034', 'pa',     '#D21034', '#005293');
