-- ════════════════════════════════════════════════════════════════════════════
-- Banco de preguntas: AUDITORÍA + EXPANSIÓN a 700 (pirámide por embudo de jugadores).
--
-- Contexto: las easy las ven los 48 jugadores en CADA partida (penales 1-3 de grupos), así que se
-- consumen y repiten muchísimo; las very_hard solo las ven los poquitos que llegan a semis/final.
-- El banco estaba casi plano (138/134/124/104) → se rebalancea a pirámide empinada (easy dominante).
--
-- Tres bloques, todo idempotente y SIN borrar preguntas (solo UPDATE/INSERT):
--   1) Reclasificación de dificultad: very_hard infladas → hard (gettables), y wc-302 → easy.
--   2) Reescritura de preguntas con dato desactualizado, autorrevelación, triviales genéricas y
--      duplicados exactos del mismo tramo (se reescribe el contenido, se mantiene el source_key).
--   3) +200 nuevas (wc-501..wc-700) sesgadas a easy/medium. Datos durables verificados a jun 2026.
--
-- Distribución final ≈ easy 269 / medium 184 / hard 165 / very_hard 82 = 700.
-- Reglas: options = array JSON de EXACTAMENTE 3; correct_index 0/1/2 rotado. (Sin columna explanation.)
-- ════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) RECLASIFICACIÓN DE DIFICULTAD
-- ─────────────────────────────────────────────────────────────────────────────
-- wc-302 ("¿cuántas selecciones por grupo en 2026?" = cuatro) es dato difundido → easy.
update public.questions set difficulty = 'easy' where source_key = 'wc-302';

-- very_hard infladas (datos recientes/gettables: estadios y marcadores de finales conocidas, clubes
-- de campeones recientes, mascotas/balón actuales, formato 2026, datos de 2022) → hard.
update public.questions set difficulty = 'hard'
where source_key in (
  'wc-179','wc-186','wc-204','wc-218','wc-219','wc-301','wc-307','wc-311','wc-314','wc-316',
  'wc-317','wc-318','wc-319','wc-320','wc-465','wc-466','wc-467','wc-468','wc-474','wc-479',
  'wc-488','wc-498','wc-499'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) REESCRITURAS (corrección de dato / autorrevelación / triviales / duplicados)
-- ─────────────────────────────────────────────────────────────────────────────
-- Dato desactualizado: marcar en 4 Mundiales ya no es solo Pelé/Seeler (Klose, CR7, Messi). Se
-- reorienta a un dato cerrado y verificable.
update public.questions set
  prompt = '¿Qué alemán marcó goles en cuatro Mundiales distintos (2002, 2006, 2010 y 2014)?',
  options = '["Miroslav Klose","Lukas Podolski","Thomas Müller"]', correct_index = 0
where source_key = 'wc-472';

-- Autorrevelación: el prompt decía "en 1970" y la respuesta era 1970.
update public.questions set
  prompt = '¿En qué Mundial se usó por primera vez el balón blanco y negro Telstar de Adidas?',
  options = '["1970","1966","1974"]', correct_index = 0
where source_key = 'wc-313';

-- Triviales genéricas (no mundialistas) → easy mundialistas.
update public.questions set
  prompt = '¿Cómo se llama la máxima competición de selecciones de fútbol del mundo?',
  options = '["La Copa del Mundo de la FIFA","La Champions League","La Copa Libertadores"]', correct_index = 0
where source_key = 'wc-357';
update public.questions set
  prompt = '¿Qué selección defiende el título en el Mundial 2026 como última campeona?',
  options = '["Francia","Argentina","Brasil"]', correct_index = 1
where source_key = 'wc-347';
update public.questions set
  prompt = '¿De qué país es Lionel Scaloni, DT campeón del mundo en 2022?',
  options = '["Italia","Argentina","Uruguay"]', correct_index = 1
where source_key = 'wc-358';

-- Duplicados exactos del mismo tramo (se diferencian).
update public.questions set
  prompt = '¿Cuántas estrellas tiene la camiseta de Argentina tras el título de 2022?',
  options = '["Tres","Dos","Cuatro"]', correct_index = 0
where source_key = 'wc-013'; -- antes: "estrellas de Brasil" (dup con wc-335)
update public.questions set
  prompt = '¿En qué país ganó Italia el Mundial de 1982?',
  options = '["España","México","Argentina"]', correct_index = 0
where source_key = 'wc-096'; -- antes: "cuántos Mundiales ganó Italia" (dup con wc-228)
update public.questions set
  prompt = '¿Cuál fue el marcador de la final del primer Mundial 1930 (Uruguay-Argentina)?',
  options = '["4-2","2-1","3-1"]', correct_index = 0
where source_key = 'wc-129'; -- antes: "a quién venció Uruguay 1930" (dup con wc-403)
update public.questions set
  prompt = '¿Ante qué selección perdió Países Bajos la final del Mundial 2010?',
  options = '["Alemania","España","Italia"]', correct_index = 1
where source_key = 'wc-160'; -- antes: "cuántas finales perdió NL" (dup con wc-102/wc-405)
update public.questions set
  prompt = '¿Ante qué selección perdió Países Bajos la final del Mundial 1978?',
  options = '["Argentina","Alemania Federal","Brasil"]', correct_index = 0
where source_key = 'wc-405'; -- antes: "perdió tres finales" (dup con wc-102/wc-160)
update public.questions set
  prompt = 'Antes de 2026, ¿cuántos países como máximo habían organizado juntos un mismo Mundial?',
  options = '["Dos","Tres","Uno"]', correct_index = 0
where source_key = 'wc-308'; -- antes: "qué dato hace único a 2026" (dup con wc-315)
update public.questions set
  prompt = '¿En qué año ganó España su único Mundial?',
  options = '["2010","2008","2014"]', correct_index = 0
where source_key = 'wc-045'; -- antes: "dónde se coronó España 2010" (dup con wc-005/wc-240)
update public.questions set
  prompt = '¿En qué continente se jugó el Mundial 2002?',
  options = '["Europa","Asia","América"]', correct_index = 1
where source_key = 'wc-240'; -- antes: "continente del Mundial 2010" (dup con wc-005/wc-045)

-- ─────────────────────────────────────────────────────────────────────────────
-- 3) +200 NUEVAS (wc-501..wc-700)
-- ─────────────────────────────────────────────────────────────────────────────
insert into public.questions (source_key, category, difficulty, prompt, options, correct_index) values
-- ───────── EASY · nacionalidades de figuras (501-575) ─────────
('wc-501','players_records','easy','¿De qué país es Lamine Yamal?','["España","Marruecos","Francia"]',0),
('wc-502','players_records','easy','¿De qué país es Nico Williams?','["España","Ghana","Portugal"]',0),
('wc-503','players_records','easy','¿De qué país es el mediocampista Rodri?','["Portugal","España","Italia"]',1),
('wc-504','players_records','easy','¿De qué país es Gavi?','["Argentina","México","España"]',2),
('wc-505','players_records','easy','¿De qué país es Bukayo Saka?','["Inglaterra","Nigeria","Francia"]',0),
('wc-506','players_records','easy','¿De qué país es Phil Foden?','["Inglaterra","Irlanda","Gales"]',0),
('wc-507','players_records','easy','¿De qué país es Declan Rice?','["Inglaterra","Irlanda","Escocia"]',0),
('wc-508','players_records','easy','¿De qué país es Marcus Rashford?','["Francia","Inglaterra","Jamaica"]',1),
('wc-509','players_records','easy','¿De qué país es Jamal Musiala?','["Inglaterra","Alemania","Nigeria"]',1),
('wc-510','players_records','easy','¿De qué país es Florian Wirtz?','["Países Bajos","Austria","Alemania"]',2),
('wc-511','players_records','easy','¿De qué país es Kai Havertz?','["Alemania","Suiza","Austria"]',0),
('wc-512','players_records','easy','¿De qué país es Joshua Kimmich?','["Alemania","Austria","Bélgica"]',0),
('wc-513','players_records','easy','¿De qué país es Rafael Leão?','["Brasil","Portugal","Angola"]',1),
('wc-514','players_records','easy','¿De qué país es Bruno Fernandes?','["Portugal","Brasil","España"]',0),
('wc-515','players_records','easy','¿De qué país es Bernardo Silva?','["España","Portugal","Brasil"]',1),
('wc-516','players_records','easy','¿De qué país es João Félix?','["Portugal","Brasil","Francia"]',0),
('wc-517','players_records','easy','¿De qué país es Nicolò Barella?','["España","Italia","Argentina"]',1),
('wc-518','players_records','easy','¿De qué país es Federico Chiesa?','["Italia","Argentina","Suiza"]',0),
('wc-519','players_records','easy','¿De qué país es Khvicha Kvaratskhelia?','["Armenia","Georgia","Ucrania"]',1),
('wc-520','players_records','easy','¿De qué país es Victor Osimhen?','["Ghana","Camerún","Nigeria"]',2),
('wc-521','players_records','easy','¿De qué país es Sadio Mané?','["Senegal","Malí","Costa de Marfil"]',0),
('wc-522','players_records','easy','¿De qué país es Riyad Mahrez?','["Marruecos","Argelia","Túnez"]',1),
('wc-523','players_records','easy','¿De qué país es Hakim Ziyech?','["Egipto","Túnez","Marruecos"]',2),
('wc-524','players_records','easy','¿De qué país es Dušan Vlahović?','["Croacia","Serbia","Eslovenia"]',1),
('wc-525','players_records','easy','¿De qué país es Joško Gvardiol?','["Croacia","Serbia","Bosnia"]',0),
('wc-526','players_records','easy','¿De qué país es Cody Gakpo?','["Bélgica","Países Bajos","Alemania"]',1),
('wc-527','players_records','easy','¿De qué país es Frenkie de Jong?','["Países Bajos","Bélgica","Alemania"]',0),
('wc-528','players_records','easy','¿De qué país es Aurélien Tchouaméni?','["Camerún","Francia","Senegal"]',1),
('wc-529','players_records','easy','¿De qué país es Ousmane Dembélé?','["Francia","Malí","Senegal"]',0),
('wc-530','players_records','easy','¿De qué país es el defensor Theo Hernández?','["España","Francia","México"]',1),
('wc-531','players_records','easy','¿De qué país es William Saliba?','["Francia","Inglaterra","Camerún"]',0),
('wc-532','players_records','easy','¿De qué país es Randal Kolo Muani?','["Congo","Francia","Bélgica"]',1),
('wc-533','players_records','easy','¿De qué país es Mohammed Kudus?','["Nigeria","Ghana","Senegal"]',1),
('wc-534','players_records','easy','¿De qué país es Robert Lewandowski?','["Polonia","Chequia","Ucrania"]',0),
('wc-535','players_records','easy','¿De qué país es Zlatan Ibrahimović?','["Croacia","Bosnia","Suecia"]',2),
('wc-536','players_records','easy','¿De qué país es Alexis Mac Allister?','["Argentina","Uruguay","Chile"]',0),
('wc-537','players_records','easy','¿De qué país es Rodrigo De Paul?','["Uruguay","Argentina","Italia"]',1),
('wc-538','players_records','easy','¿De qué país es el defensor Cristian Romero?','["Italia","Argentina","España"]',1),
('wc-539','players_records','easy','¿De qué país es Weston McKennie?','["Canadá","México","Estados Unidos"]',2),
('wc-540','players_records','easy','¿De qué país es Tyler Adams?','["Estados Unidos","Canadá","Inglaterra"]',0),
('wc-541','players_records','easy','¿De qué país es Eden Hazard?','["Francia","Bélgica","Países Bajos"]',1),
('wc-542','players_records','easy','¿De qué país es Arturo Vidal?','["Chile","Perú","Colombia"]',0),
('wc-543','players_records','easy','¿De qué país es Alexis Sánchez?','["Perú","Chile","Ecuador"]',1),
('wc-544','players_records','easy','¿De qué país es Radamel Falcao?','["Venezuela","Ecuador","Colombia"]',2),
('wc-545','players_records','easy','¿De qué país es el arquero Keylor Navas?','["Costa Rica","Panamá","Honduras"]',0),
('wc-546','players_records','easy','¿De qué país es Edinson Cavani?','["Argentina","Uruguay","Paraguay"]',1),
('wc-547','players_records','easy','¿De qué país es el arquero Guillermo Ochoa?','["México","Estados Unidos","Colombia"]',0),
('wc-548','players_records','easy','¿De qué país es Hirving "Chucky" Lozano?','["Estados Unidos","Costa Rica","México"]',2),
('wc-549','players_records','easy','¿De qué país es el arquero Wojciech Szczęsny?','["Polonia","Chequia","Hungría"]',0),
('wc-550','players_records','easy','¿De qué país es la leyenda Andriy Shevchenko?','["Rusia","Ucrania","Polonia"]',1),
('wc-551','players_records','easy','¿De qué país era Pelé?','["Argentina","Portugal","Brasil"]',2),
('wc-552','players_records','easy','¿De qué país era Diego Maradona?','["Argentina","Italia","Uruguay"]',0),
('wc-553','players_records','easy','¿De qué país es la leyenda Johan Cruyff?','["Alemania","Países Bajos","Bélgica"]',1),
('wc-554','players_records','easy','¿De qué país es Franz Beckenbauer?','["Austria","Suiza","Alemania"]',2),
('wc-555','players_records','easy','¿De qué país es Zinedine Zidane?','["Francia","Argelia","España"]',0),
('wc-556','players_records','easy','¿De qué país es Ronaldo Nazário "El Fenómeno"?','["Portugal","Brasil","España"]',1),
('wc-557','players_records','easy','¿De qué país es Ronaldinho?','["Brasil","Portugal","Argentina"]',0),
('wc-558','players_records','easy','¿De qué país es Roberto Baggio?','["España","Italia","Argentina"]',1),
('wc-559','players_records','easy','¿De qué país es Paolo Maldini?','["Italia","Francia","Brasil"]',0),
('wc-560','players_records','easy','¿De qué país es el arquero Gianluigi Buffon?','["España","Italia","Portugal"]',1),
('wc-561','players_records','easy','¿De qué país es el arquero Iker Casillas?','["Portugal","Italia","España"]',2),
('wc-562','players_records','easy','¿De qué país es Xavi Hernández?','["España","Argentina","Italia"]',0),
('wc-563','players_records','easy','¿De qué país es David Beckham?','["Estados Unidos","Inglaterra","Irlanda"]',1),
('wc-564','players_records','easy','¿De qué país es Wayne Rooney?','["Irlanda","Escocia","Inglaterra"]',2),
('wc-565','players_records','easy','¿De qué país es Thierry Henry?','["Francia","Bélgica","Senegal"]',0),
('wc-566','players_records','easy','¿De qué país es Didier Drogba?','["Ghana","Costa de Marfil","Senegal"]',1),
('wc-567','players_records','easy','¿De qué país es Samuel Eto''o?','["Camerún","Nigeria","Senegal"]',0),
('wc-568','players_records','easy','¿De qué país es Hristo Stoichkov?','["Rumania","Bulgaria","Serbia"]',1),
('wc-569','players_records','easy','¿De qué país es Gabriel Batistuta?','["Argentina","Uruguay","Italia"]',0),
('wc-570','players_records','easy','¿De qué país es Carlos Valderrama "El Pibe"?','["Venezuela","Ecuador","Colombia"]',2),
('wc-571','players_records','easy','¿De qué país es Diego Forlán?','["Argentina","Uruguay","Chile"]',1),
('wc-572','players_records','easy','¿De qué país es Hugo Sánchez?','["México","España","Estados Unidos"]',0),
('wc-573','players_records','easy','¿De qué país es la leyenda George Weah?','["Senegal","Nigeria","Liberia"]',2),
('wc-574','players_records','easy','¿De qué país es Gheorghe Hagi?','["Bulgaria","Rumania","Hungría"]',1),
('wc-575','players_records','easy','¿De qué país es Andrés Iniesta?','["España","Portugal","Italia"]',0),
-- ───────── EASY · apodos de selecciones (576-583) ─────────
('wc-576','trivia','easy','¿Cómo se apoda a la selección de México?','["El Tri","La Roja","La Albirroja"]',0),
('wc-577','trivia','easy','¿Cómo se apoda a la selección de Bélgica?','["Los Diablos Rojos","Los Leones","La Furia"]',0),
('wc-578','trivia','easy','¿Cómo se apoda a la selección de Camerún?','["Las Águilas","Los Leones Indomables","Los Elefantes"]',1),
('wc-579','trivia','easy','¿Cómo se apoda a la selección de Australia?','["Kangaroos","Wallabies","Socceroos"]',2),
('wc-580','trivia','easy','¿Cómo se apoda a la selección de Japón?','["Los Samuráis Azules","Los Dragones","Los Tigres"]',0),
('wc-581','trivia','easy','¿Cómo se apoda a la selección de Nigeria?','["Los Leopardos","Las Súper Águilas","Las Panteras"]',1),
('wc-582','trivia','easy','¿Cómo se apoda a la selección de Senegal?','["Los Faraones","Las Estrellas","Los Leones de Teranga"]',2),
('wc-583','trivia','easy','¿Cómo se apoda a la selección de Costa de Marfil?','["Los Elefantes","Los Leones","Las Cebras"]',0),
-- ───────── EASY · sedes, continentes y campeones (584-600) ─────────
('wc-584','hosts','easy','¿En qué país se jugó el Mundial 1950?','["Argentina","Brasil","Chile"]',1),
('wc-585','hosts','easy','¿En qué país se jugó el Mundial 1966?','["Inglaterra","Suecia","Suiza"]',0),
('wc-586','hosts','easy','¿En qué país se jugó el Mundial 1974?','["Italia","Alemania Federal","Países Bajos"]',1),
('wc-587','hosts','easy','¿En qué país se jugó el Mundial 1982?','["España","Italia","Francia"]',0),
('wc-588','hosts','easy','¿En qué continente se jugó el Mundial 1994?','["Europa","América del Norte","Asia"]',1),
('wc-589','hosts','easy','¿En qué continente se juega principalmente el Mundial 2026?','["América del Norte","Europa","Asia"]',0),
('wc-590','hosts','easy','¿En qué continente está Brasil, sede del Mundial 2014?','["América del Sur","África","Europa"]',0),
('wc-591','champions','easy','¿Qué selección ganó el "Milagro de Berna", el Mundial 1954?','["Hungría","Alemania Federal","Austria"]',1),
('wc-592','champions','easy','¿Qué selección ganó el Mundial 1970 en México?','["Brasil","Italia","Alemania"]',0),
('wc-593','champions','easy','¿Qué selección ganó el Mundial 1986 con Maradona como figura?','["Brasil","Argentina","Alemania Federal"]',1),
('wc-594','champions','easy','¿Qué selección ganó el Mundial 1990 en Italia?','["Argentina","Alemania Federal","Italia"]',1),
('wc-595','champions','easy','¿Qué selección ganó el Mundial 1962 en Chile?','["Brasil","Chile","Checoslovaquia"]',0),
('wc-596','champions','easy','¿Qué selección ganó el Mundial 1938?','["Hungría","Brasil","Italia"]',2),
('wc-597','champions','easy','¿Qué selección fue subcampeona del Mundial 2006, perdiendo por penales?','["Francia","Portugal","Alemania"]',0),
('wc-598','champions','easy','¿Qué selección fue subcampeona del Mundial 2010?','["España","Países Bajos","Alemania"]',1),
('wc-599','champions','easy','¿Qué selección fue subcampeona del Mundial 1994, perdiendo por penales?','["Italia","Brasil","Suecia"]',0),
('wc-600','champions','easy','¿En qué país se consagró campeona Argentina en 2022?','["Brasil","Catar","Emiratos Árabes Unidos"]',1),
-- ───────── EASY · más nacionalidades (601-627) y apodos inversos (628-630) ─────────
('wc-601','players_records','easy','¿De qué país es Sergio "Kun" Agüero?','["Argentina","México","Chile"]',0),
('wc-602','players_records','easy','¿De qué país es Javier Mascherano?','["Uruguay","Argentina","Paraguay"]',1),
('wc-603','players_records','easy','¿De qué país es Ángel Di María?','["Argentina","Italia","Chile"]',0),
('wc-604','players_records','easy','¿De qué país es James Rodríguez?','["Venezuela","Colombia","Ecuador"]',1),
('wc-605','players_records','easy','¿De qué país es Ivan Rakitić?','["Serbia","Bosnia","Croacia"]',2),
('wc-606','players_records','easy','¿De qué país es Mateo Kovačić?','["Croacia","Serbia","Eslovenia"]',0),
('wc-607','players_records','easy','¿De qué país es Wout Weghorst?','["Bélgica","Países Bajos","Alemania"]',1),
('wc-608','players_records','easy','¿De qué país es Denzel Dumfries?','["Surinam","Bélgica","Países Bajos"]',2),
('wc-609','players_records','easy','¿De qué país es Kalidou Koulibaly?','["Senegal","Malí","Francia"]',0),
('wc-610','players_records','easy','¿De qué país es Youssef En-Nesyri?','["Argelia","Marruecos","Egipto"]',1),
('wc-611','players_records','easy','¿De qué país es Sofyan Amrabat?','["Túnez","Egipto","Marruecos"]',2),
('wc-612','players_records','easy','¿De qué país es el arquero André Onana?','["Camerún","Nigeria","Senegal"]',0),
('wc-613','players_records','easy','¿De qué país es Thomas Partey?','["Nigeria","Ghana","Costa de Marfil"]',1),
('wc-614','players_records','easy','¿De qué país es Wilfried Zaha?','["Ghana","Nigeria","Costa de Marfil"]',2),
('wc-615','players_records','easy','¿De qué país es Serge Gnabry?','["Alemania","Francia","Camerún"]',0),
('wc-616','players_records','easy','¿De qué país es el defensor Antonio Rüdiger?','["Suiza","Alemania","Austria"]',1),
('wc-617','players_records','easy','¿De qué país es Leroy Sané?','["Senegal","Francia","Alemania"]',2),
('wc-618','players_records','easy','¿De qué país es el defensor Harry Maguire?','["Inglaterra","Escocia","Gales"]',0),
('wc-619','players_records','easy','¿De qué país es Jordan Henderson?','["Irlanda","Inglaterra","Escocia"]',1),
('wc-620','players_records','easy','¿De qué país es Raheem Sterling?','["Jamaica","Francia","Inglaterra"]',2),
('wc-621','players_records','easy','¿De qué país es el delantero Álvaro Morata?','["España","Italia","Portugal"]',0),
('wc-622','players_records','easy','¿De qué país es Dani Olmo?','["Croacia","España","Alemania"]',1),
('wc-623','players_records','easy','¿De qué país es el arquero Unai Simón?','["Italia","Portugal","España"]',2),
('wc-624','players_records','easy','¿De qué país es el arquero Mike Maignan?','["Francia","Bélgica","Senegal"]',0),
('wc-625','players_records','easy','¿De qué país es Kingsley Coman?','["Camerún","Francia","Guadalupe"]',1),
('wc-626','players_records','easy','¿De qué país es Adrien Rabiot?','["Bélgica","Suiza","Francia"]',2),
('wc-627','players_records','easy','¿De qué país es el arquero Hugo Lloris?','["Francia","España","Italia"]',0),
('wc-628','trivia','easy','¿Qué selección es conocida como "La Albiceleste"?','["Argentina","Uruguay","Chile"]',0),
('wc-629','trivia','easy','¿Qué selección es conocida como "La Canarinha"?','["Colombia","Brasil","Ecuador"]',1),
('wc-630','trivia','easy','¿Qué selección es conocida como "Les Bleus"?','["Bélgica","Italia","Francia"]',2),
-- ───────── MEDIUM (631-680) ─────────
('wc-631','players_records','medium','¿Quién fue el capitán de Brasil campeón en 1970, autor de un golazo en la final?','["Carlos Alberto Torres","Pelé","Gérson"]',0),
('wc-632','champions','medium','¿Cuál fue el marcador de la final del Mundial 2014 (Alemania-Argentina)?','["1-0","2-0","2-1"]',0),
('wc-633','champions','medium','¿Cuál fue el marcador de la final del Mundial 2018 (Francia-Croacia)?','["4-2","3-1","2-1"]',0),
('wc-634','players_records','medium','¿Quién ganó el Balón de Oro al mejor jugador del Mundial 1998?','["Ronaldo","Zinedine Zidane","Davor Šuker"]',0),
('wc-635','players_records','medium','¿Quién dirigió a Brasil campeón del Mundial 2002?','["Luiz Felipe Scolari","Carlos Alberto Parreira","Mário Zagallo"]',0),
('wc-636','players_records','medium','¿Quién dirigió a Alemania campeona del Mundial 2014?','["Jürgen Klinsmann","Joachim Löw","Hansi Flick"]',1),
('wc-637','players_records','medium','¿Quién dirigió a Francia campeona del Mundial 1998?','["Aimé Jacquet","Didier Deschamps","Roger Lemerre"]',0),
('wc-638','records','medium','¿Cuántas plazas directas tiene África (CAF) en el Mundial 2026?','["Nueve","Cinco","Siete"]',0),
('wc-639','records','medium','¿Cuántas plazas directas tiene Asia (AFC) en el Mundial 2026?','["Ocho","Cuatro","Seis"]',0),
('wc-640','records','medium','¿Cuántas plazas directas tiene Oceanía (OFC) en el Mundial 2026, por primera vez?','["Una","Dos","Cero"]',0),
('wc-641','records','medium','¿Cuántas selecciones avanzan de la fase de grupos a la siguiente ronda en el Mundial 2026?','["32","16","24"]',0),
('wc-642','players_records','medium','¿En qué club jugaba Diego Maradona durante el Mundial 1990?','["Napoli","Sevilla","Boca Juniors"]',0),
('wc-643','players_records','medium','¿En qué club brilló Pelé durante casi toda su carrera?','["Santos","Cosmos de Nueva York","Flamengo"]',0),
('wc-644','players_records','medium','¿En qué club jugaba Zinedine Zidane en el Mundial 2006?','["Juventus","Real Madrid","Bordeaux"]',1),
('wc-645','players_records','medium','¿Quién fue el capitán de España campeona del Mundial 2010?','["Iker Casillas","Carles Puyol","Xavi Hernández"]',0),
('wc-646','players_records','medium','¿Quién ganó el Balón de Oro al mejor jugador del Mundial 2010?','["Wesley Sneijder","Diego Forlán","Andrés Iniesta"]',1),
('wc-647','upsets','medium','¿Qué selección eliminó a Argentina en los cuartos de final del Mundial 2010 con un 4-0?','["Alemania","Brasil","España"]',0),
('wc-648','upsets','medium','¿Qué selección eliminó a Brasil en los cuartos de final del Mundial 2010?','["Países Bajos","Uruguay","Ghana"]',0),
('wc-649','upsets','medium','¿Qué selección eliminó a Inglaterra por penales en los cuartos del Mundial 2006?','["Portugal","Francia","Alemania"]',0),
('wc-650','scorers','medium','¿Quién marcó el primer gol de Italia en la final del Mundial 1982?','["Paolo Rossi","Marco Tardelli","Alessandro Altobelli"]',0),
('wc-651','champions','medium','¿Qué selección fue subcampeona del Mundial 1990?','["Argentina","Italia","Inglaterra"]',0),
('wc-652','champions','medium','¿Qué selección fue subcampeona del Mundial 1986?','["Alemania Federal","Bélgica","Francia"]',0),
('wc-653','players_records','medium','¿Quién ganó el Balón de Oro al mejor jugador del Mundial 1986?','["Diego Maradona","Gary Lineker","Karl-Heinz Rummenigge"]',0),
('wc-654','players_records','medium','¿Quién ganó el Balón de Oro al mejor jugador del Mundial 1990?','["Salvatore Schillaci","Lothar Matthäus","Diego Maradona"]',0),
('wc-655','scorers','medium','¿Quién compartió la Bota de Oro del Mundial 1994 con seis goles?','["Hristo Stoichkov","Roberto Baggio","Gabriel Batistuta"]',0),
('wc-656','records','medium','¿Cuántos partidos jugó cada selección en la fase de grupos del Mundial 2022?','["Tres","Cuatro","Dos"]',0),
('wc-657','records','medium','¿Cuántas selecciones disputaron el Mundial 2022 en Catar?','["32","48","24"]',0),
('wc-658','hosts','medium','¿En qué año se jugará el Mundial siguiente al de 2026?','["2030","2028","2031"]',0),
('wc-659','hosts','medium','¿Qué tres países serán las sedes principales del Mundial 2030?','["España, Portugal y Marruecos","Italia, Francia y Suiza","Inglaterra, Irlanda y Gales"]',0),
('wc-660','hosts','medium','¿Qué país será la sede del Mundial 2034?','["Arabia Saudita","Catar","China"]',0),
('wc-661','upsets','medium','¿Qué jugador ghanés falló un penal en el último minuto de los cuartos de final de 2010?','["Asamoah Gyan","Sulley Muntari","Kevin-Prince Boateng"]',0),
('wc-662','upsets','medium','¿Contra qué selección jugó Argentina la semifinal del Mundial 2022?','["Croacia","Países Bajos","Marruecos"]',0),
('wc-663','scorers','medium','¿Cuántos goles hizo Kylian Mbappé en el Mundial 2022, ganando la Bota de Oro?','["Ocho","Siete","Seis"]',0),
('wc-664','scorers','medium','¿Cuántos goles marcó Lionel Messi en la final del Mundial 2022?','["Dos","Uno","Tres"]',0),
('wc-665','scorers','medium','¿Cuántos goles marcó Kylian Mbappé en la final del Mundial 2022?','["Tres","Dos","Uno"]',0),
('wc-666','players_records','medium','¿Quién dirigió a Croacia al subcampeonato del Mundial 2018?','["Zlatko Dalić","Ante Čačić","Slaven Bilić"]',0),
('wc-667','players_records','medium','¿Quién dirigió a Inglaterra, semifinalista del Mundial 2018?','["Gareth Southgate","Roy Hodgson","Sam Allardyce"]',0),
('wc-668','players_records','medium','¿Quién dirigió a Países Bajos al subcampeonato del Mundial 2010?','["Bert van Marwijk","Louis van Gaal","Guus Hiddink"]',0),
('wc-669','players_records','medium','¿Quién dirigió a Alemania Federal campeona del Mundial 1990?','["Franz Beckenbauer","Berti Vogts","Helmut Schön"]',0),
('wc-670','players_records','medium','¿Quién dirigió a Italia campeona del Mundial 1982?','["Enzo Bearzot","Marcello Lippi","Arrigo Sacchi"]',0),
('wc-671','players_records','medium','¿En qué club jugaba Cafú cuando ganó su primer Mundial en 1994?','["São Paulo","Roma","Real Madrid"]',0),
('wc-672','records','medium','¿Qué selección fue la primera en ganar cuatro Mundiales?','["Italia (2006)","Alemania (2014)","Brasil (1994)"]',2),
('wc-673','records','medium','¿Qué selección fue la primera en ganar cinco Mundiales?','["Brasil","Alemania","Italia"]',0),
('wc-674','records','medium','¿Qué confederación suma más títulos mundiales en la historia?','["UEFA (Europa)","CONMEBOL (Sudamérica)","CONCACAF"]',0),
('wc-675','records','medium','Además de Brasil y Argentina, ¿qué otra selección sudamericana ganó el Mundial?','["Uruguay","Chile","Paraguay"]',0),
('wc-676','records','medium','¿Cuántas selecciones europeas distintas ganaron el Mundial al menos una vez?','["Cinco","Cuatro","Seis"]',0),
('wc-677','champions','medium','¿En qué año ganó Inglaterra su único Mundial, jugando de local?','["1966","1970","1962"]',0),
('wc-678','records','medium','¿Qué número de edición de la Copa del Mundo fue Catar 2022?','["La 22ª","La 21ª","La 23ª"]',0),
('wc-679','records','medium','¿En qué Mundial se permitieron por primera vez cinco cambios por equipo?','["2022","2018","2014"]',0),
('wc-680','records','medium','¿Cuántos jugadores tuvo cada plantel en el Mundial 2022?','["26","23","30"]',0),
-- ───────── HARD (681-698) ─────────
('wc-681','scorers','hard','¿Quién fue el goleador del Mundial 1982 en España?','["Paolo Rossi","Karl-Heinz Rummenigge","Zbigniew Boniek"]',0),
('wc-682','records','hard','¿Cuántos goles hizo Miroslav Klose en total en los Mundiales, récord histórico?','["16","14","15"]',0),
('wc-683','records','hard','¿Cuántos goles hizo Gerd Müller en total en los Mundiales?','["14","12","16"]',0),
('wc-684','champions','hard','¿Qué selección terminó cuarta en el Mundial 2002?','["Corea del Sur","Turquía","Senegal"]',0),
('wc-685','records','hard','¿Cuántas selecciones jugaron el Mundial 1982, el primero con 24 equipos?','["24","16","20"]',0),
('wc-686','hosts','hard','¿En qué estadio se jugó la final del Mundial 2014?','["Maracaná","Arena Corinthians","Mineirão"]',0),
('wc-687','hosts','hard','¿En qué ciudad se jugó la final del Mundial 1986?','["Ciudad de México","Guadalajara","Monterrey"]',0),
('wc-688','upsets','hard','¿Qué selección eliminó a España en los cuartos del Mundial 2002, por penales?','["Corea del Sur","Estados Unidos","Turquía"]',0),
('wc-689','upsets','hard','¿Qué selección eliminó a Estados Unidos en los cuartos del Mundial 2002?','["Alemania","Brasil","España"]',0),
('wc-690','records','hard','¿Cuántas finales de Mundial disputó Alemania (incluida Alemania Federal)?','["Ocho","Seis","Siete"]',0),
('wc-691','records','hard','¿Cuántas finales de Mundial disputó Argentina?','["Seis","Cinco","Cuatro"]',0),
('wc-692','records','hard','¿Cuántas finales de Mundial disputó Brasil?','["Siete","Seis","Ocho"]',0),
('wc-693','scorers','hard','¿Cuántos goles hizo Eusébio en el Mundial 1966, siendo el goleador?','["Nueve","Seis","Siete"]',0),
('wc-694','upsets','hard','¿En qué puesto terminó Francia, campeona defensora, en su grupo del Mundial 2002?','["Última, sin marcar goles","Segunda","Tercera"]',0),
('wc-695','records','hard','¿Cuántos goles se marcaron en total en el Mundial 2022, récord del torneo?','["172","146","160"]',0),
('wc-696','players_records','hard','¿Qué arquero fue figura de Marruecos en su histórico Mundial 2022?','["Yassine Bounou","Munir Mohamedi","Ahmed Reda Tagnaouti"]',0),
('wc-697','scorers','hard','¿Quién marcó el primer gol de Argentina (de penal) en la final del Mundial 2022?','["Lionel Messi","Ángel Di María","Julián Álvarez"]',0),
('wc-698','upsets','hard','¿Qué selección africana llegó por primera vez a semifinales de un Mundial, en 2022?','["Marruecos","Senegal","Ghana"]',0),
-- ───────── VERY_HARD (699-700) ─────────
('wc-699','records','very_hard','¿Cuántas ediciones del Mundial se disputaron en el siglo XX (1930-1998)?','["Dieciséis","Quince","Diecisiete"]',0),
('wc-700','records','very_hard','¿Cuál fue la última selección en ganar el Mundial siendo anfitriona?','["Francia (1998)","Argentina (1978)","Alemania (1974)"]',0)
on conflict (source_key) do update set
  category = excluded.category,
  difficulty = excluded.difficulty,
  prompt = excluded.prompt,
  options = excluded.options,
  correct_index = excluded.correct_index;
