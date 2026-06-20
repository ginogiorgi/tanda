-- Tanda — refresh del banco de preguntas (Sesión G del rediseño 2026-06-20).
--
-- El Mundial 2026 ya se está jugando (anfitriones EE. UU./Canadá/México, 48 selecciones,
-- 12 grupos, 104 partidos, inaugural en el Estadio Azteca, final en el MetLife). Esta migración:
--   1. Pasa a PRESENTE las 4 preguntas que hablaban del 2026 en futuro (ya no "jugarán/organizarán").
--   2. Reescribe 5 preguntas claramente DUPLICADAS (4 sobre los 13 goles de Fontaine, 1 de Klose-16,
--      1 de Ronaldo-15, 1 de la 1ª tanda de penales 1982) en preguntas nuevas y distintas. Se hace por
--      UPDATE (no DELETE) para no tocar las FKs de `tournament_questions`.
--   3. Suma 100 preguntas nuevas (wc-221..wc-320): ~20 sobre el Mundial 2026 (datos estables: sedes,
--      mascotas, balón, formato) + ~80 durables (historia/records/figuras), sin repetir las existentes.
--
-- `correct_index` rotado entre 0/1/2 para que no haya patrón explotable. Idempotente: `source_key`
-- estable + `on conflict (source_key) do nothing`. Datos verificados a jun 2026 (FIFA/Wikipedia).

-- ── 1. Presente (el 2026 ya se juega) ─────────────────────────────────────────────────────────
update public.questions set prompt = '¿Cuántos países organizan el Mundial 2026?' where source_key = 'wc-028';
update public.questions set prompt = '¿Cuántos equipos juegan el Mundial 2026?' where source_key = 'wc-037';
update public.questions set prompt = '¿Qué tres países organizan el Mundial 2026?' where source_key = 'wc-201';
update public.questions set prompt = '¿Qué país es el primero en organizar tres Mundiales, incluido el de 2026?' where source_key = 'wc-202';

-- ── 2. Reescritura de duplicados (mismo source_key/categoría/dificultad, contenido nuevo) ──────
update public.questions
  set prompt = '¿Quién marcó los dos goles de Argentina en el tiempo regular y el alargue de la final del Mundial 2022?',
      options = '["Ángel Di María","Lionel Messi","Julián Álvarez"]', correct_index = 1, explanation = 'Messi marcó en ambos tiempos; la final terminó 3-3.'
  where source_key = 'wc-069';
update public.questions
  set prompt = '¿Quién es el máximo goleador de Portugal en la historia de los Mundiales?',
      options = '["Eusébio","Cristiano Ronaldo","Pauleta"]', correct_index = 1, explanation = null
  where source_key = 'wc-143';
update public.questions
  set prompt = '¿Cuál es el único país anfitrión del Mundial 2026 que ya había sido sede dos veces antes?',
      options = '["México","Estados Unidos","Canadá"]', correct_index = 0, explanation = 'México: 1970 y 1986.'
  where source_key = 'wc-145';
update public.questions
  set prompt = '¿Quién dirigió a Argentina hasta la final del Mundial 2014?',
      options = '["Alejandro Sabella","Gerardo Martino","Lionel Scaloni"]', correct_index = 0, explanation = null
  where source_key = 'wc-148';
update public.questions
  set prompt = '¿En qué Mundial se adoptaron por primera vez tres puntos por victoria en la fase de grupos?',
      options = '["1994","1990","1998"]', correct_index = 0, explanation = null
  where source_key = 'wc-178';

-- ── 3. 100 preguntas nuevas (wc-221..wc-320) ──────────────────────────────────────────────────
insert into public.questions (source_key, category, difficulty, prompt, options, correct_index, explanation) values
-- ───────── EASY (221-248) ─────────
('wc-221','hosts','easy','¿En qué país se juega el partido inaugural del Mundial 2026?','["México","Estados Unidos","Canadá"]',0,'En el Estadio Azteca de la Ciudad de México.'),
('wc-222','records','easy','¿Cuántas mascotas tiene el Mundial 2026?','["Una","Tres","Dos"]',1,'Una por cada país anfitrión.'),
('wc-223','trivia','easy','¿Cómo se llama el balón oficial del Mundial 2026?','["Brazuca","Al Rihla","Trionda"]',2,null),
('wc-224','hosts','easy','¿En qué país se juega la final del Mundial 2026?','["Estados Unidos","México","Canadá"]',0,'En el MetLife Stadium, cerca de Nueva York.'),
('wc-225','players_records','easy','¿Quién ganó el Balón de Oro al mejor jugador del Mundial 2022?','["Kylian Mbappé","Lionel Messi","Luka Modrić"]',1,null),
('wc-226','players_records','easy','¿Quién dirigió a Argentina campeona del Mundial 2022?','["Lionel Scaloni","Diego Simeone","Mauricio Pochettino"]',0,null),
('wc-227','records','easy','¿Cuántos Mundiales ganó Argentina en su historia?','["Dos","Tres","Cuatro"]',1,'1978, 1986 y 2022.'),
('wc-228','records','easy','¿Cuántos Mundiales ganó Italia?','["Cuatro","Tres","Dos"]',0,null),
('wc-229','players_records','easy','¿De qué país es Kylian Mbappé?','["Bélgica","Francia","Suiza"]',1,null),
('wc-230','trivia','easy','El Mundial 2026 tiene tres mascotas. ¿Qué animal representa a Canadá?','["Un alce (Maple)","Un jaguar (Zayu)","Un águila (Clutch)"]',0,null),
('wc-231','trivia','easy','¿Qué animal es Zayu, la mascota mexicana del Mundial 2026?','["Un puma","Un jaguar","Un lobo"]',1,null),
('wc-232','hosts','easy','¿En qué año se juega el Mundial siguiente a Qatar 2022?','["2025","2027","2026"]',2,null),
('wc-233','champions','easy','¿Qué selección terminó en tercer puesto en el Mundial 2022?','["Marruecos","Croacia","Países Bajos"]',1,null),
('wc-234','records','easy','¿Cuántos goles convirtió Lionel Messi en el Mundial 2022?','["Siete","Cinco","Diez"]',0,null),
('wc-235','players_records','easy','¿De qué país es Cristiano Ronaldo?','["España","Brasil","Portugal"]',2,null),
('wc-236','hosts','easy','¿En qué país se jugó el Mundial 2022?','["Catar","Emiratos Árabes","Arabia Saudita"]',0,null),
('wc-237','players_records','easy','¿Quién atajó penales en la tanda de la final del Mundial 2022 para Argentina?','["Emiliano Martínez","Franco Armani","Gerónimo Rulli"]',0,null),
('wc-238','records','easy','¿Cuántos Mundiales ganó Francia?','["Uno","Dos","Tres"]',1,'1998 y 2018.'),
('wc-239','players_records','easy','¿Qué número de camiseta usa Lionel Messi en la Selección Argentina?','["10","9","11"]',0,null),
('wc-240','hosts','easy','¿En qué continente se jugó el Mundial 2010?','["Asia","Europa","África"]',2,null),
('wc-241','trivia','easy','¿Qué animal es Clutch, la mascota estadounidense del Mundial 2026?','["Un águila calva","Un oso","Un bisonte"]',0,null),
('wc-242','champions','easy','¿Qué puesto consiguió Marruecos en el Mundial 2022, récord para África?','["Cuarto","Tercero","Subcampeón"]',0,null),
('wc-243','players_records','easy','¿De qué país es Vinícius Júnior?','["Portugal","Brasil","Uruguay"]',1,null),
('wc-244','records','easy','¿Cuántos Mundiales ganó Uruguay?','["Uno","Dos","Tres"]',1,'1930 y 1950.'),
('wc-245','players_records','easy','¿Quién marcó el penal del título para Argentina en la tanda de la final 2022?','["Gonzalo Montiel","Lautaro Martínez","Nicolás Otamendi"]',0,null),
('wc-246','records','easy','¿En cuántos grupos se reparten las 48 selecciones del Mundial 2026?','["Doce","Ocho","Dieciséis"]',0,null),
('wc-247','hosts','easy','¿En qué mes arranca el Mundial 2026?','["Mayo","Junio","Julio"]',1,'El 11 de junio.'),
('wc-248','trivia','easy','¿Cuántas ciudades sede tiene el Mundial 2026?','["Doce","Dieciséis","Veinte"]',1,null),
-- ───────── MEDIUM (249-274) ─────────
('wc-249','records','medium','¿Cuántos partidos en total tiene el Mundial 2026?','["64","104","80"]',1,null),
('wc-250','players_records','medium','¿Quién ganó el Balón de Oro al mejor jugador del Mundial 2006?','["Fabio Cannavaro","Zinedine Zidane","Andrea Pirlo"]',1,null),
('wc-251','players_records','medium','¿Qué arquero ganó el Balón de Oro del Mundial 2002, único en lograrlo?','["Gianluigi Buffon","Iker Casillas","Oliver Kahn"]',2,null),
('wc-252','scorers','medium','¿Quién fue el goleador del Mundial 2006 con cinco goles?','["Miroslav Klose","Hernán Crespo","Thierry Henry"]',0,null),
('wc-253','players_records','medium','¿Quién ganó el Balón de Oro del Mundial 1982?','["Paolo Rossi","Falcão","Karl-Heinz Rummenigge"]',0,null),
('wc-254','players_records','medium','¿Quién ganó el Balón de Oro del Mundial 1994?','["Roberto Baggio","Romário","Hristo Stoichkov"]',1,null),
('wc-255','upsets','medium','¿Qué selección eliminó a Brasil en los cuartos de final del Mundial 2022?','["Croacia","Países Bajos","Marruecos"]',0,'Por penales tras el 1-1.'),
('wc-256','upsets','medium','¿Qué selección eliminó a España en octavos del Mundial 2022?','["Japón","Marruecos","Suiza"]',1,'Por penales.'),
('wc-257','records','medium','¿Quién es el máximo goleador histórico de Argentina en los Mundiales?','["Gabriel Batistuta","Lionel Messi","Diego Maradona"]',1,'Messi superó los 10 de Batistuta.'),
('wc-258','records','medium','¿Cuántos Mundiales disputó Lionel Messi?','["Cuatro","Cinco","Seis"]',1,'2006 a 2022.'),
('wc-259','records','medium','¿Cuántos Mundiales disputó Diego Maradona?','["Cuatro","Tres","Cinco"]',0,'1982 a 1994.'),
('wc-260','players_records','medium','¿Quién marcó el penal decisivo de Italia en la tanda de la final del Mundial 2006?','["Marco Materazzi","Fabio Grosso","Alessandro Del Piero"]',1,null),
('wc-261','trivia','medium','El balón "Trionda" del Mundial 2026 significa "tres olas". ¿A qué hace referencia?','["A los tres países anfitriones","A los tres continentes","A las tres finales previas"]',0,null),
('wc-262','hosts','medium','¿En qué estadio se juega la final del Mundial 2026?','["Rose Bowl","MetLife Stadium","SoFi Stadium"]',1,null),
('wc-263','hosts','medium','¿En qué estadio se juega el partido inaugural del Mundial 2026?','["Estadio Azteca","Estadio BBVA","MetLife Stadium"]',0,null),
('wc-264','players_records','medium','¿Quién dirigió a España campeona del Mundial 2010?','["Vicente del Bosque","Luis Aragonés","Luis Enrique"]',0,null),
('wc-265','players_records','medium','¿Quién fue el capitán de Francia campeona del Mundial 2018?','["Antoine Griezmann","Hugo Lloris","Raphaël Varane"]',1,null),
('wc-266','records','medium','¿Qué selección fue la primera africana en disputar un Mundial, en 1934?','["Egipto","Marruecos","Túnez"]',0,null),
('wc-267','records','medium','¿En qué Mundial se introdujeron las tarjetas amarilla y roja?','["1966","1970","1974"]',1,null),
('wc-268','records','medium','¿Cuántos Mundiales disputó Cristiano Ronaldo?','["Cuatro","Cinco","Seis"]',1,'2006 a 2022.'),
('wc-269','records','medium','En el Mundial 2026, ¿cuántas selecciones de cada grupo avanzan de forma directa (sin contar mejores terceros)?','["Las dos primeras","Solo la primera","Las tres primeras"]',0,null),
('wc-270','records','medium','¿Cuántos Mundiales ganó España?','["Uno","Dos","Tres"]',0,'Solo el de 2010.'),
('wc-271','players_records','medium','¿Quién era el máximo goleador de Argentina en Mundiales antes de que lo superara Messi?','["Gabriel Batistuta","Diego Maradona","Hernán Crespo"]',0,'Batistuta, con 10 goles.'),
('wc-272','trivia','medium','El Mundial 2026 estrena una ronda nueva por la ampliación a 48 equipos. ¿Cuál?','["Los treintaidosavos de final","Un repechaje final","Una fase de consuelo"]',0,null),
('wc-273','scorers','medium','¿Quién fue el segundo máximo goleador del Mundial 2022, detrás de Mbappé?','["Julián Álvarez","Lionel Messi","Olivier Giroud"]',1,'Messi hizo 7; Mbappé 8.'),
('wc-274','records','medium','En el Mundial 2026, además de los dos primeros de cada grupo, ¿cuántos "mejores terceros" avanzan a la siguiente ronda?','["Ocho","Cuatro","Seis"]',0,null),
-- ───────── HARD (275-298) ─────────
('wc-275','trivia','hard','¿Cuál fue la primera mascota de la historia de los Mundiales, en 1966?','["World Cup Willie","Juanito","Naranjito"]',0,null),
('wc-276','players_records','hard','¿Qué arquero fue capitán y campeón del mundo a los 40 años, en 1982?','["Dino Zoff","Gianluigi Buffon","Sepp Maier"]',0,null),
('wc-277','records','hard','¿Qué selección ganó el primer Mundial disputado con el actual trofeo de la FIFA (desde 1974)?','["Alemania Federal","Brasil","Argentina"]',0,null),
('wc-278','players_records','hard','¿Quién diseñó el actual trofeo de la Copa del Mundo de la FIFA?','["Silvio Gazzaniga","Abel Lafleur","Jules Rimet"]',0,null),
('wc-279','records','hard','¿En qué año se juega el primer Mundial de la historia con 48 selecciones?','["2022","2026","2018"]',1,null),
('wc-280','hosts','hard','¿En qué zona de Estados Unidos se juega la final del Mundial 2026?','["Nueva York / Nueva Jersey","Los Ángeles","Dallas"]',0,'El MetLife Stadium está en East Rutherford, Nueva Jersey.'),
('wc-281','records','hard','¿Cuántos goles convirtió Lionel Messi en toda su carrera mundialista, récord para Argentina?','["13","10","16"]',0,null),
('wc-282','upsets','hard','En 2022 Arabia Saudita venció 2-1 a Argentina dirigida por...','["Hervé Renard","Roberto Mancini","Carlos Queiroz"]',0,null),
('wc-283','players_records','hard','¿Quién marcó el gol más rápido en una final de Mundial, de penal a los dos minutos en 1974?','["Johan Cruyff","Johan Neeskens","Paul Breitner"]',1,null),
('wc-284','records','hard','¿En qué dos años no se disputó el Mundial por la Segunda Guerra Mundial?','["1942 y 1946","1940 y 1944","1939 y 1943"]',0,null),
('wc-285','trivia','hard','¿Cómo se llamó la mascota del Mundial 2010 en Sudáfrica?','["Footix","Zakumi","Fuleco"]',1,null),
('wc-286','trivia','hard','¿Cómo se llamó la mascota del Mundial 1998 en Francia?','["Footix","Striker","Ciao"]',0,null),
('wc-287','players_records','hard','¿Quién fue el jugador de más edad en marcar un gol en un Mundial, con 42 años en 1994?','["Roger Milla","Essam El-Hadary","Faryd Mondragón"]',0,null),
('wc-288','records','hard','¿En qué Mundial se usó por primera vez la tecnología de línea de gol?','["2010","2014","2018"]',1,null),
('wc-289','champions','hard','¿Cuál fue el marcador de la final del Mundial 1986 (Argentina-Alemania Federal)?','["3-2","2-1","2-0"]',0,null),
('wc-290','champions','hard','¿Cuál fue el marcador de la final del Mundial 1990 (Alemania Federal-Argentina)?','["2-0","1-0","1-1"]',1,'Penal de Brehme.'),
('wc-291','records','hard','¿Cuántas selecciones distintas ganaron al menos un Mundial hasta 2022?','["Ocho","Diez","Seis"]',0,'Uruguay, Italia, Alemania, Brasil, Inglaterra, Argentina, Francia y España.'),
('wc-292','hosts','hard','De los tres anfitriones del Mundial 2026, ¿cuál nunca había organizado un Mundial masculino?','["Canadá","México","Estados Unidos"]',0,null),
('wc-293','trivia','hard','¿Cómo se llamó la mascota del Mundial 2018 en Rusia?','["Zabivaka","La''eeb","Fuleco"]',0,null),
('wc-294','upsets','hard','¿Qué selección eliminó a Portugal de Cristiano Ronaldo en los cuartos del Mundial 2022?','["Marruecos","Suiza","Croacia"]',0,null),
('wc-295','champions','hard','La final del Mundial 2022 terminó 3-3 y se definió por penales. ¿Cuál fue el resultado de la tanda?','["4-2","3-1","5-3"]',0,null),
('wc-296','players_records','hard','¿Quién marcó un triplete en la final del Mundial 2022, el primero en una final desde 1966?','["Lionel Messi","Kylian Mbappé","Ángel Di María"]',1,null),
('wc-297','trivia','hard','¿Qué mascota representó al Mundial 2014 en Brasil?','["Zakumi","Fuleco","Gauchito"]',1,null),
('wc-298','records','hard','¿En qué año ganó Argentina su primer título mundial?','["1978","1986","1974"]',0,null),
-- ───────── VERY_HARD (299-320) ─────────
('wc-299','players_records','very_hard','¿Quién es el jugador con más partidos disputados en la historia de los Mundiales?','["Lothar Matthäus","Lionel Messi","Paolo Maldini"]',1,'Messi llegó a 26 partidos.'),
('wc-300','records','very_hard','¿Cuál fue el primer Mundial sin partido final, definido por una liguilla?','["1950","1930","1954"]',0,null),
('wc-301','trivia','very_hard','¿Cómo se llamó la mascota del Mundial 1982 en España?','["Naranjito","Juanito","Pique"]',0,null),
('wc-302','records','very_hard','¿Cuántas selecciones integran cada grupo en la fase de grupos del Mundial 2026?','["Cuatro","Tres","Cinco"]',0,null),
('wc-303','players_records','very_hard','¿Quién marcó el primer gol del Mundial 2022?','["Enner Valencia","Cody Gakpo","Saúd Abdulhamid"]',0,'Ecuador ante Catar.'),
('wc-304','hosts','very_hard','¿Qué estadio mexicano del Mundial 2026 ya fue sede de las finales de 1970 y 1986?','["Estadio Azteca","Estadio BBVA","Estadio Akron"]',0,null),
('wc-305','records','very_hard','¿Cuál fue la final de Mundial con más goles?','["Brasil 5-2 Suecia (1958)","Argentina 3-2 Alemania (1986)","Inglaterra 4-2 Alemania (1966)"]',0,null),
('wc-306','players_records','very_hard','¿Quién dirigió a Italia campeona del Mundial 2006?','["Marcello Lippi","Cesare Maldini","Roberto Mancini"]',0,null),
('wc-307','trivia','very_hard','¿Cómo se llamó la mascota del Mundial 2022 en Catar?','["La''eeb","Zabivaka","Kaayu"]',0,null),
('wc-308','records','very_hard','¿Qué dato hace único al Mundial 2026 respecto a sus anfitriones?','["Es el primero con tres países anfitriones","Es el primero en dos continentes","Es el primero en el hemisferio norte"]',0,null),
('wc-309','records','very_hard','El Mundial 2018 batió el récord de autogoles. ¿Cuántos hubo?','["12","6","9"]',0,null),
('wc-310','upsets','very_hard','¿Qué campeona defensora quedó eliminada en la primera ronda del Mundial 2002?','["Francia","Italia","Brasil"]',0,'Francia, campeona en 1998.'),
('wc-311','trivia','very_hard','¿Qué tres colores predominan en el balón Trionda del Mundial 2026?','["Rojo, verde y azul","Blanco y negro","Dorado y negro"]',0,null),
('wc-312','upsets','very_hard','¿Qué selección goleó 5-1 a España, campeona defensora, en el Mundial 2014?','["Países Bajos","Chile","Australia"]',0,'Revancha de la final 2010.'),
('wc-313','records','very_hard','¿En qué Mundial se usó por primera vez el balón blanco y negro Telstar, en 1970?','["1970","1966","1974"]',0,null),
('wc-314','trivia','very_hard','En el balón Trionda del Mundial 2026, ¿qué símbolo representa a Estados Unidos?','["Una estrella","Un águila","Una hoja de arce"]',0,null),
('wc-315','hosts','very_hard','¿Cuál es el primer Mundial de la historia disputado en tres países?','["2026","2002","1930"]',0,null),
('wc-316','records','very_hard','¿Cuántos partidos jugará el campeón del Mundial 2026 si avanza desde la fase de grupos?','["Ocho","Siete","Seis"]',0,null),
('wc-317','players_records','very_hard','¿Quién dirigió a Marruecos en su histórico cuarto puesto del Mundial 2022?','["Walid Regragui","Hervé Renard","Vahid Halilhodžić"]',0,null),
('wc-318','players_records','very_hard','¿Quién marcó el segundo gol de Argentina (el 2-0) en la final del Mundial 2022?','["Ángel Di María","Julián Álvarez","Lautaro Martínez"]',0,null),
('wc-319','players_records','very_hard','¿Quién ganó el premio al mejor jugador joven del Mundial 2022?','["Enzo Fernández","Jude Bellingham","Pedri"]',0,null),
('wc-320','records','very_hard','¿Qué número de edición de la Copa del Mundo es la de 2026?','["La 23ª","La 22ª","La 24ª"]',0,'Catar 2022 fue la 22ª.')
on conflict (source_key) do nothing;
