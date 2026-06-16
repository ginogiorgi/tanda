-- Tanda — F5 / tarea 5.0: seed de 48 selecciones.
--
-- Pool = top 48 del ranking FIFA (16 jun 2026), de Argentina (1) a Venezuela (48). Decisión:
-- usamos el ranking FIFA como fuente (directiva del owner) en vez de la lista literal de
-- clasificados, para que el dato sea verificable y sin riesgo de equivocar qué país clasificó.
-- `fifa_rank` = posición en ese ranking. `difficulty_tier` por la banda del §7.2 BRIEF (lo usa
-- 5.1 para el modelo de bots): top 10 = elite, 11-20 = high, 21-30 = medium, resto = low
-- (10/10/10/18). `kit_primary` = color de camiseta titular (tiñe el avatar en el penal, §8.3);
-- `kit_secondary` reservado a futuro. `accent_color` = color para acentos de UI (= kit_primary).
-- `flag_asset` = código ISO-2 (o gb-eng/sct/wls) para derivar la bandera en F8.
--
-- Idempotente: `on conflict (code) do nothing`.
insert into public.nations (code, name, fifa_rank, difficulty_tier, accent_color, flag_asset, kit_primary, kit_secondary) values
  ('ARG', 'Argentina',         1,  'elite',  '#75AADB', 'ar',     '#75AADB', '#FFFFFF'),
  ('FRA', 'Francia',           2,  'elite',  '#1E3A8A', 'fr',     '#1E3A8A', '#FFFFFF'),
  ('ESP', 'España',            3,  'elite',  '#C60B1E', 'es',     '#C60B1E', '#FFC400'),
  ('ENG', 'Inglaterra',        4,  'elite',  '#FFFFFF', 'gb-eng', '#FFFFFF', '#001E62'),
  ('POR', 'Portugal',          5,  'elite',  '#C8102E', 'pt',     '#C8102E', '#006600'),
  ('BRA', 'Brasil',            6,  'elite',  '#FFDF00', 'br',     '#FFDF00', '#009C3B'),
  ('MAR', 'Marruecos',         7,  'elite',  '#C1272D', 'ma',     '#C1272D', '#006233'),
  ('NED', 'Países Bajos',      8,  'elite',  '#F36C21', 'nl',     '#F36C21', '#FFFFFF'),
  ('GER', 'Alemania',          9,  'elite',  '#FFFFFF', 'de',     '#FFFFFF', '#000000'),
  ('BEL', 'Bélgica',           10, 'elite',  '#E30613', 'be',     '#E30613', '#FFD700'),
  ('CRO', 'Croacia',           11, 'high',   '#FF0000', 'hr',     '#FF0000', '#FFFFFF'),
  ('ITA', 'Italia',            12, 'high',   '#0066CC', 'it',     '#0066CC', '#FFFFFF'),
  ('MEX', 'México',            13, 'high',   '#006847', 'mx',     '#006847', '#FFFFFF'),
  ('COL', 'Colombia',          14, 'high',   '#FCD116', 'co',     '#FCD116', '#003893'),
  ('USA', 'EE. UU.',           15, 'high',   '#FFFFFF', 'us',     '#FFFFFF', '#002868'),
  ('SEN', 'Senegal',           16, 'high',   '#00853F', 'sn',     '#00853F', '#FFFFFF'),
  ('JPN', 'Japón',             17, 'high',   '#000080', 'jp',     '#000080', '#FFFFFF'),
  ('URU', 'Uruguay',           18, 'high',   '#5CBFEB', 'uy',     '#5CBFEB', '#001E62'),
  ('SUI', 'Suiza',             19, 'high',   '#D52B1E', 'ch',     '#D52B1E', '#FFFFFF'),
  ('DEN', 'Dinamarca',         20, 'high',   '#C60C30', 'dk',     '#C60C30', '#FFFFFF'),
  ('KOR', 'República de Corea', 21, 'medium', '#CD2E3A', 'kr',    '#CD2E3A', '#001E62'),
  ('AUS', 'Australia',         22, 'medium', '#FFCD00', 'au',     '#FFCD00', '#00843D'),
  ('IRN', 'RI de Irán',        23, 'medium', '#FFFFFF', 'ir',     '#FFFFFF', '#239F40'),
  ('AUT', 'Austria',           24, 'medium', '#ED2939', 'at',     '#ED2939', '#FFFFFF'),
  ('NGA', 'Nigeria',           25, 'medium', '#008751', 'ng',     '#008751', '#FFFFFF'),
  ('TUR', 'Turquía',           26, 'medium', '#E30A17', 'tr',     '#E30A17', '#FFFFFF'),
  ('ALG', 'Argelia',           27, 'medium', '#006633', 'dz',     '#006633', '#FFFFFF'),
  ('ECU', 'Ecuador',           28, 'medium', '#FFD100', 'ec',     '#FFD100', '#0072CE'),
  ('EGY', 'Egipto',            29, 'medium', '#CE1126', 'eg',     '#CE1126', '#FFFFFF'),
  ('CIV', 'Costa de Marfil',   30, 'medium', '#FF7F00', 'ci',     '#FF7F00', '#009E60'),
  ('NOR', 'Noruega',           31, 'low',    '#BA0C2F', 'no',     '#BA0C2F', '#00205B'),
  ('CAN', 'Canadá',            32, 'low',    '#D80621', 'ca',     '#D80621', '#FFFFFF'),
  ('UKR', 'Ucrania',           33, 'low',    '#FFD500', 'ua',     '#FFD500', '#005BBB'),
  ('PAN', 'Panamá',            34, 'low',    '#D21034', 'pa',     '#D21034', '#005293'),
  ('SWE', 'Suecia',            35, 'low',    '#FECC00', 'se',     '#FECC00', '#006AA7'),
  ('RUS', 'Rusia',             36, 'low',    '#DA291C', 'ru',     '#DA291C', '#FFFFFF'),
  ('POL', 'Polonia',           37, 'low',    '#FFFFFF', 'pl',     '#FFFFFF', '#DC143C'),
  ('SCO', 'Escocia',           38, 'low',    '#002663', 'gb-sct', '#002663', '#FFFFFF'),
  ('WAL', 'Gales',             39, 'low',    '#C8102E', 'gb-wls', '#C8102E', '#006600'),
  ('HUN', 'Hungría',           40, 'low',    '#C8102E', 'hu',     '#C8102E', '#436F4D'),
  ('SRB', 'Serbia',            41, 'low',    '#C6363C', 'rs',     '#C6363C', '#0C4076'),
  ('PAR', 'Paraguay',          42, 'low',    '#DA121A', 'py',     '#DA121A', '#0038A8'),
  ('CZE', 'Chequia',           43, 'low',    '#D7141A', 'cz',     '#D7141A', '#11457E'),
  ('CMR', 'Camerún',           44, 'low',    '#007A33', 'cm',     '#007A33', '#CE1126'),
  ('COD', 'RD Congo',          45, 'low',    '#007FFF', 'cd',     '#007FFF', '#F7D618'),
  ('SVK', 'Eslovaquia',        46, 'low',    '#0B4EA2', 'sk',     '#0B4EA2', '#FFFFFF'),
  ('GRE', 'Grecia',            47, 'low',    '#0D5EAF', 'gr',     '#0D5EAF', '#FFFFFF'),
  ('VEN', 'Venezuela',         48, 'low',    '#7B1113', 've',     '#7B1113', '#FFFFFF')
on conflict (code) do nothing;
