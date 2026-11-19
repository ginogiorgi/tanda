# TODO — TANDA ⚽

## ⏸ HANDOFF
- **Plan:** Feedback 3 (`docs/FEEDBACK-3.md`), aprobado por Gino el 18/11 y en ejecución.
- **Hecho:** F0 (capturas: `bash scripts/e2e/shots.sh [filtro]`, PNG en `SHOTS_DIR`), F1 (prod `2457f09`,
  migraciones `20261125000000/01`), F2 (prod `80e72fb`, migración `20261125000002`), F3 (solo front). Smoke prod 42 + penal de
  invitado OK en ambas.
- **Fase en curso:** F4 (sin scroll en PC + tablas de Argentino).
- **Último deploy:** F2 — 19/11 00:30. Hueco medido en prod (cron, sin cliente): 4,40 s.
- **Para retomar:** `git log --oneline -15`; seguir la primera tarea sin ✅. Migraciones nuevas desde
  `20261125000003`.

## Plan — Feedback 3 (18/11)
Fuente: `docs/FEEDBACK-3.md` (números #N = sus puntos). Vara: "app de multinacional". Todo lo visual con capturas
Playwright a 390×844 y 1440×900 (animaciones en varios cuadros), mirando cada captura como director de arte e
iterando. Cada fase cierra con verde completo (typecheck · lint · knip · unit · components · db · build · e2e ·
flow) → push a main → migraciones por MCP + ledger reconciliado al nombre de archivo + `get_advisors` → smoke
contra prod (`E2E_BASE_URL=… pnpm test:e2e` + penal de invitado). Nunca dejar prod roto. "(propia)" = mejora mía
autorizada por Gino. Migraciones nuevas desde `20261125000000_*` (último en prod: `20261124000007`).

### F0 — Baseline y herramienta de capturas
- [x] **0.1 Verde de referencia.** Medido el 18/11: typecheck · lint · knip OK, unit 209, components 48, db 108
  (e2e/flow no corridos). Repetir y anotar.
- [x] **0.2 Capturas reproducibles (propia):** `playwright.shots.config.ts` (proyectos `390` = 390×844 dpr 2 touch,
  `1440` = 1440×900; `testDir: e2e/shots`, `reuseExistingServer`) + `scripts/e2e/shots.sh` (reusa el env local de
  `scripts/e2e/flow.sh`, que pasa a aceptar `E2E_CONFIG` y `E2E_SKIP_BUILD=1`) + `e2e/shots/*.spec.ts` que dejan PNG
  en `SHOTS_DIR` (scratchpad). `playwright.config.ts` ignora `shots/**`. Specs: menús (home, cómo jugar, /jugar,
  globos, perfil, cola ranked, sala), penal (`/dev/penal` por cuadros), torneo (entre partidos, campeón).
  **Acepta:** `bash scripts/e2e/shots.sh` genera las 2×N capturas sin tocar prod.

### F1 — Bugs y cosas a sacar
- [x] **1.1 (#7) Cómo jugar** sin la sección "Torneos y Ranked" (`lib/help/howto.ts`). **Verifica:** `help.spec`
  (la hoja no contiene "Torneos y Ranked") + captura.
- [x] **1.2 (#8) Globos de modo:** el "?" de Ranked pasa ADENTRO de su tarjeta (wrapper `relative`, botón `pr-13`,
  "?" `absolute right-1.5 top-1/2 -translate-y-1/2`; se saca la flecha "→", como Mundial/Argentino que no la
  tienen). Se elimina el "?" de "Con amigos" y `PLAY_KINDS.room` (`PlayKindId = "ranked"`). **Verifica:**
  `help.spec` reescrito: 3 globos (no 4) y cada uno con su `boundingBox` dentro del de su tarjeta; capturas.
- [x] **1.3 (#9)** Fuera "Liga — No suma puntos de liga…" de Mundial y Argentino: `ModeHelp.ranked` opcional, se
  borra `NOT_RANKED`, `modeHelpSections` omite secciones vacías (flatMap). Ranked conserva su "Liga".
  **Verifica:** `help.spec` (la ayuda de Mundial no contiene "Liga"), `modes_help.test.ts` sigue verde.
- [x] **1.4 (#4) Creador de avatar** sin "Deshacer": se borran `history`, `undo`, el botón y la mención del doc
  (`AvatarCreator.tsx`); "Aleatorio" queda solo en su fila. `avatar.spec`: en vez de Aleatorio→Deshacer, asserta
  que no existe "Deshacer". Captura con usuario registrado (el invitado redirige a /perfil).
- [x] **1.5 (#11) Sala de espera** sin "Sala de espera · <modo>" (el modo ya está en el header "Sala · <modo>") ni
  "Arranca solo cuando termine la cuenta". Un solo `Lobby` → todos los modos. Captura 390/1440.
- [x] **1.6 (#13) Cola Ranked:** fuera "Solo humanos · 5 penales + muerte súbita · Abandonar = derrota" y "Buscando
  a alguien de tu nivel". En su lugar "N esperando" (0, 1, 2…) **sin contarte**. Decisión de diseño (eficiencia DB):
  **Presence** de Realtime en el canal `ranked:queue` con `key = user.id` (la página pasa `userId`): estar en la
  pantalla = estar encolado (se encola al montar, cancela al salir, al emparejar navega y la presencia se va) →
  exacto, en tiempo real y **cero consultas**; además `ranked_poll` deja de hacer el `COUNT` de la cola en cada
  latido (2 s por jugador) y se quita `in_queue` de `RankedPoll`. Helpers puros `lib/ranked/queue.ts`
  (`othersWaiting(state, me)` = keys distintas de la mía con ≥1 presencia; `waitingLabel(n)`) con unit test (no te
  cuenta, varias pestañas = 1, keys vacías no cuentan). El bloque del reloj queda con `border-t-2` solo (el borde de
  abajo sobraba). **Verifica:** unit, captura "0 esperando", y en flow `ranked.spec` (2 jugadores) que antes de
  emparejar alguno vea "1 esperando".
- [x] **1.7 (#16) No repetir preguntas — todos los modos.** Diagnóstico en prod (18/11, solo lectura): dentro de un
  torneo NO se repite nada por jugador (36/36, 38/38 distintas); lo que se repite es **entre torneos** — Gino jugó
  dos de Argentino seguidos (99 penales, 96 preguntas distintas, 30 temas para 23 distintos); en Mundial había jugado
  uno solo, por eso "andaba". (Ojo: `assign_round_question` comparte la pregunta de una misma fecha/llave + idx entre
  todos los partidos del torneo; eso es a propósito y no es repetición para el jugador.) Fix:
  - tabla `user_seen_questions(user_id → profiles on delete cascade, question_id, seen_at, PK(user_id, question_id))`
    + índice en `seen_at`, RLS sin policy, `revoke all` a anon/authenticated;
  - `open_penalty_internal` inserta (on conflict actualiza `seen_at`) para el pateador y el arquero humanos;
  - `take_tournament_question`: humanos del torneo → excluye lo que vio cualquiera de ellos y ordena por tema usado
    en el torneo, tema ya visto, misma categoría, seed; si la dificultad (y vecinas) se agotó, toma la vista hace más
    tiempo (`max(seen_at) nulls first`); nunca falla;
  - poda diaria por `pg_cron` (`tanda-seen-prune`, >120 días).
  **Verifica:** `supabase/tests/seen_questions.test.ts` — por modo (worldcup, arg, ranked) 2 torneos de 45 preguntas
  del mismo humano → 0 preguntas y 0 temas repetidos; dos humanos → evita lo de cualquiera; invitado
  (`is_anonymous`) igual; banco agotado → la más vieja; abrir el penal registra a los 2 humanos; el cliente no tiene
  privilegios sobre la tabla. (Prototipo: db 116/116 verde.)
- [x] **1.8 (propia) Perfil:** el nombre largo del invitado (`INVITADO_773416798`) desborda a lo ancho en 390 (scroll
  horizontal). `h2` del perfil → `text-4xl sm:text-5xl wrap-anywhere` (los dos, invitado y registrado). Captura +
  `assertLayout` sobre /perfil en el flow.
- [x] **Cierre F1:** (unit 213 · components 48 · db 116 · e2e 42 · flow 9; prod `2457f09`) verde + deploy (front y migración) + smoke + captura en prod de /jugar y la cola.

### F2 — Revelado al final y tiempos (#2, #12)
Contexto: hoy, al llegar `penal:result`, `PenalLive` pinta el cartel (GOL/ATAJADO + "Correcta: …") en el mismo
instante en que arranca la animación, y además el server cierra el penal **antes** de los 10 s si respondieron los
dos (`resolve_penalty`: `now() < deadline and not penalty_all_answered → too_early`) → el resultado se ve antes de
tiempo. Línea de tiempo de la jugada (`lib/penal/shot.ts` + `rig.ts`): patada 0,3 s · pelota en el arco 1,0 s ·
se asienta 1,6 s · reacción 1,6–2,5 s. Huecos actuales: `betweenPenalsS 3`, `betweenMatchesS 7`,
`MATCH_RESULT_LINGER_MS 2000`, `RANKED_RESULT_LINGER_MS 2500`.
- [x] **2.1 Regla:** el penal (1ª fase y 2ª chance) se resuelve **solo al vencer el tiempo**: se quita el cierre
  anticipado de `resolve_penalty` (vuelve la regla de `CLAUDE.md`). El contador sigue congelado en tu tap.
  Tests db: `select_option` de los dos + `resolve_penalty` antes del deadline → `too_early`.
  *(Ver "Pendiente de revisión con Gino".)*
- [x] **2.2 Orden del revelado** (todos los modos: es el mismo `PenalLive`): tiempo cumplido → escena juega el remate
  **sin cartel** (y sin la correcta) → al definirse la jugada (`REVEAL_AT` ≈ 1,6 s: pelota quieta en la red / en
  las manos / afuera) aparece el MISMO cartel de hoy (mismo contenido) → se queda **2,5 s** → próximo penal. El
  sonido de gol/atajada se dispara en `BALL_T1` (cuando la pelota llega), no al recibir el resultado (propia). Reduced
  motion: cuadro final y cartel a los `REVEAL_AT`. La espera visible durante la jugada no muestra texto que delate.
- [x] **2.3 Tiempos en la fuente única:** `TIMING` gana `revealS` (jugada) y `resultCardS: 2.5`;
  `betweenPenalsS = revealS + resultCardS` (≈ 4,1 → redondear a décimas) en `TIMING` ↔ `game_timing()` (paridad);
  el SQL pasa a leer `numeric` (`make_interval(secs => (…)::numeric)`) y el test "enteros" pasa a "positivos con ≤1
  decimal". Entre partidos: jugada + cartel + `MATCH_RESULT_LINGER` + tabla. `RANKED_RESULT_LINGER_MS` desaparece
  (ranked usa lo mismo). **Verifica (Gino pidió medirlo; ya hubo un bug de 10 s):**
  - unit: cada pausa del cliente calza exacta en su hueco del server;
  - db: en un partido completo y en un torneo entero con `_drive`, `round_deadline − resolución` = exactamente
    `betweenPenalsS` en cada penal (incluye 2ª chance, muerte súbita, cambio de fecha y de fase), sin acumulación;
  - e2e flow con reloj real: penal N `resolved` → penal N+1 `open` = `betweenPenalsS` ± 1 s en todo un partido, y el
    cartel visible ≥ 2,4 s (timestamps del DOM).
- [x] **2.4 (#12) Fase de grupos:** entre fechas, el resultado del partido se ve **≥ 2 s** antes de la tabla
  (hoy el linger compite con el poll de 1 s y a veces se ve un instante). `MATCH_RESULT_LINGER_MS` ≥ 2000 medido
  desde que aparece el cartel del último penal, y `betweenMatchesS` recalculado para dejar ≥ 3 s de tabla. Test de
  tiempos + e2e que mide el cartel final ≥ 2 s.
- [x] **Cierre F2:** verde (unit 217 · db 118 · flow 9) + deploy `80e72fb`. Medido: local cartel 2,6–2,8 s,
  jugada ~1,8 s, resultado→próximo penal 4,4–4,6 s; prod (cron) 4,40 s. **Hallazgo (propia):** `supabase.rpc()` es
  perezoso → los `void supabase.rpc(...)` (resolve_penalty, open_next_round, begin_presentation, ranked_cancel)
  nunca salían; todo lo hacía el cron con ~1 s de atraso. `fire()` + lint.

### F3 — Vista dron, arquero y arco (#1, #5)
Archivos: `components/penal/PenalScene.tsx` (cámara `CAM_IDLE/CAM_SHOT`, actores), `Stadium.tsx` (`Grass`,
`PitchLines`, `Goal`, red, tribuna), `lib/avatar/rig.ts` (`KEEPER_DIVE`, `KEEPER_CELEBRATE`), `lib/penal/shot.ts`.
Revisar en `/dev/penal?shot=…&t=…` (freeze por cuadro). Headless: `google-chrome-stable --headless=new
--use-angle=swiftshader`.
- [x] **3.1 Cámara dron inclinada** (≈ 50–60° de inclinación, no cenital), detrás y arriba del pateador mirando al
  arco: arco arriba del cuadro, área grande, área chica, **medialuna** (falta hoy) y punto del penal; pasto a franjas
  anchas alternadas (más contraste, como la foto) y líneas de cal más finas y prolijas. Avatares legibles (escala y
  encuadre: pateador abajo de espaldas, arquero arriba de frente). Leve empuje de cámara en la jugada (propia);
  reduced motion = cuadro final. En celu la tarjeta de la pregunta tapa la parte de abajo → el encuadre deja la
  acción en el tercio superior. **Verifica:** capturas 390/1440 idle + 6 cuadros de gol, atajada y afuera
  (alto y bajo).
- [x] **3.2 Arquero:** hoy en `KEEPER_DIVE` los hombros van a ±2,7–2,95 rad (manos arriba de la cabeza) → parece
  bugueado. Nueva atajada: flexión y paso de impulso hacia el lado, estirada lateral con el cuerpo en línea, brazos
  extendidos **hacia la altura de la pelota** (bajo/alto según `target.y`), caída de costado amortiguada y
  reincorporación; cuando no llega, misma estirada a destiempo y sin tocar. **Verifica:** test del rig (en la
  atajada la mano queda a < 0,3 m del `target` en `BALL_T1`; en el gol, lejos), capturas cuadro a cuadro
  (0,2–2,0 s cada 0,2) para los 4 variants.
- [x] **3.3 Arco:** hoy son 3 cilindros sueltos (se notan las esquinas). Marco de un solo tubo con esquinas
  redondeadas (curva en los ángulos, `TubeGeometry` sobre un path), sección redonda, red con caída natural
  (`backH`) y soportes traseros, sombra del arco sobre el pasto. **Verifica:** capturas de cerca y en la vista dron.
- [x] **Cierre F3:** verde (unit 248 · components 48 · db 118 · e2e 42 · flow 9) + `perf:budget` `/partido` 243,9/248
  KB. Hecho: cámara `lib/penal/camera.ts` (dron ~49°, calibrada por búsqueda y testeada por proyección en celu/PC/
  tablet), estirada paramétrica `keeperDive(reach)` + `keeperRecover` (`lib/avatar/rig.ts`, pose compartida en
  `lib/penal/keeper.ts`) con test de cinemática directa sobre el GLB real (`lib/avatar/fkNode.ts` +
  `rig.glb.test.ts`: mano < 0,3 m de la pelota en las 4 atajadas, lejos en el gol, nunca bajo el piso), atajada
  más al palo (x ±1,5) y alta a 1,3 m; en el gol el arquero sale 0,12 s tarde. Arco de un tubo (`TubeGeometry`,
  esquinas curvas) + soportes + sombra; franjas anchas, cal de 4,5 cm, línea del área y medialuna. El último
  cartel se ancla también al revelado real (timer atrasado ⇒ igual dura entero).

### F4 — Sin scroll en PC + tablas de Argentino (#10, #3)
- [ ] **4.1 Layout:** hoy `app/layout.tsx` pone el contenido en `min-h-svh` y el footer debajo → todo scrollea. Nuevo:
  body `min-h-svh flex-col`, contenido `flex-1`, footer al final del flujo (nunca `fixed`) → si entra, sin scroll y
  footer visible al pie; si no entra, scrollea el documento. `GameStage` deja de medir `h-svh` y ocupa el alto
  disponible (`flex-1` con mínimo para el penal). En PC home y `/jugar` entran sin scroll en 1440×900 (y 1366×768,
  propia); compactar lo que haga falta (márgenes del hero, `my-auto`). Celu puede scrollear.
  `docs/DESIGN-RULES.md` (regla y §Layout) y `e2e/_layout.ts` reescritos: "si el contenido entra, el footer se ve sin
  scrollear y el documento no scrollea; si no, se llega scrolleando"; e2e nuevo: home y /jugar en 1440×900 con
  `scrollHeight == innerHeight`. Lint de layout ajustado si hace falta.
- [ ] **4.2 (#3) Argentino entre partidos:** en `Bracket.tsx` (fase de grupos) tu zona va a la izquierda en tamaño
  normal y "la otra zona" a la derecha en `compact` y en una columna que la estira → se ven de distinto tamaño. Para
  2 zonas: tu próximo partido arriba y **las dos tablas lado a lado, mismo componente y tamaño** (tu zona marcada).
  Mundial (12 grupos) conserva su grilla. Capturas 390/1440 en Argentino y Mundial.
- [ ] **Cierre F4:** verde (layout en 4 viewports) + deploy.

### F5 — Pantalla de campeón (#6)
- [ ] Hoy `<Confetti>` es una capa `fixed` que cae encima del resultado y los botones. Nuevo: escena de fondo con la
  cancha (`PitchBackground`) y papelitos **detrás** del contenido, lanzados desde los bordes (tribuna) hacia adentro y
  quedando en el pasto; resultado (copa + equipo + título) y botones con contraste perfecto. Reduced motion =
  papelitos quietos. Revisar también `RunSummary`/`Bracket` con campeón (propia). **Verifica:** capturas en 3 cuadros
  390/1440 + test de capa (los papelitos tienen z menor que el contenido) + `champion.spec` (E2E_SLOW).

### F6 — Reportar bugs / pedir mejoras (#17)
- [ ] **6.1 UI:** botón flotante abajo a la derecha, solo en home y pantallas de menú (nunca en `(game)`, sala ni
  cola), `data-layer="overlay"` (allowlist de layout), ≥ 44 px, no tapa la acción principal. Hoja (`<dialog>`, como
  `HelpSheet`): tipo Bug/Mejora (radio) + texto (contador, máx. 1000), honeypot oculto, enviar, estado de envío y
  confirmación; errores claros. Accesible (axe), mobile first.
- [ ] **6.2 Server:** route handler `POST /api/feedback` (Node): valida tipo/largo, honeypot, escapa HTML; rate-limit
  por usuario e IP (tabla con ventana, p. ej. 5/h y 20/día); guarda en `feedback_reports` (RLS sin policy, solo
  service role); manda mail con `lib/email/resend.ts` desde `Tanda <no-reply@tanda2026.com.ar>` a
  ginorubengiorgi@pyrux.com.ar, asunto **exacto** `[Tanda] Bug: <primeras palabras>` / `[Tanda] Mejora: <primeras
  palabras>`; cuerpo: usuario (o "Invitado"), id, fecha y hora America/Argentina/Buenos_Aires, tipo, mensaje, ruta,
  dispositivo/navegador/SO (UA parseado), viewport y pantalla, versión (`VERCEL_GIT_COMMIT_SHA`), idioma y zona
  horaria del cliente, último torneo activo si hay. Sin mail del usuario ni tokens. Si Resend falla, queda guardado.
- [ ] **Verifica:** unit del armado (asunto exacto, truncado de palabras, escape, sin datos sensibles), db/route test
  del límite y honeypot, e2e del formulario (flow, sin mandar mail: `RESEND_API_KEY` vacío), capturas, y **un**
  reporte real en prod marcado "[prueba]" para validar la entrega y el filtro de Gmail.

### F7 — Ranking de hinchas (#15)
- [ ] **7.1 DB:** `profiles.fav_club_id` / `fav_nation_id` (FK a `teams` del modo correspondiente, CHECK de modo
  inline con coalesce — ver lección CHECK/permisos), tabla `fan_counts(team_id, fans)` mantenida por trigger en
  insert/update/delete de `profiles` (nada de COUNT en caliente), RPC `set_favorites` (rate-limit) y
  `get_fan_ranking()` (lee `fan_counts`, top por modo). Grants explícitos. Tests db (contadores exactos tras altas,
  cambios y bajas; concurrencia).
- [ ] **7.2 Alta obligatoria:** el registro (y el upgrade de invitado) pide club y país favoritos con selectores
  buscables con escudo/bandera; sin favoritos no se completa. Tests de `RegisterForm`.
- [ ] **7.3 Pantalla `/hinchas`** (`lib/nav/routes.ts`): botón "Ranking de hinchas" en la home entre "Cómo jugar" y
  "Tu perfil"; arriba los dos selectores a la par (cambio inmediato, sin límite); debajo, ranking de países y de
  clubes (posición, escudo, nombre, hinchas, el tuyo marcado). Invitado: ve el ranking, para elegir se le ofrece
  crear cuenta. Capturas.
- [ ] **7.4 Asignación en sala (server, `start_tournament`):** cada humano registrado con favorito del modo tiene
  prioridad; si varios comparten favorito, sorteo por seed; a los que pierden (y a invitados) un equipo al azar que
  **nadie** de la sala tenga de favorito; los bots, el resto. Tests db: 1 humano, 2 con el mismo favorito, N con
  favoritos cruzados, invitados, sala llena.
- [ ] **7.5 Sala de espera:** escudo/bandera del favorito del modo a la derecha del nombre (va en el `track` de
  presence; el server lo da en `join_room`/página). Captura.
- [ ] **7.6 Wipe de cuentas en prod** (autorizado por Gino): export previo de `auth.users`, `profiles`, ranked,
  historial y awards a `/mnt/hera/Backups/tanda-db/<fecha>/` con md5 validado contra el Postgres local (patrón de la
  limpieza del 17/11) → borrar usuarios (cascade) → verificar conteos en 0 y que la app arranca limpia.
- [ ] **Cierre F7:** verde + deploy + smoke de alta con favoritos en prod.

### F8 — Escudos (#14)
- [ ] **8.1** Actualizar la regla de "assets originales" de `CLAUDE.md` (decisión de Gino 18/11: se acepta el parecido
  porque Tanda no genera plata; sigue prohibido logo/tipografía/mascota de FIFA) y el disclaimer de la home.
- [ ] **8.2 Clubes (30):** hoy `scripts/crests/build_crests.py` genera un sistema genérico (silueta por hash + patrón
  de camiseta + siglas) → "algunos son cualquier cosa". Rehacer cada uno como SVG propio parecido al real (forma,
  colores, franjas/bandas, iniciales/elementos característicos) en `public/crests/arg/`, con el script como
  normalizador (tamaño, viewBox, trazo). Uno por uno contra la referencia.
- [ ] **8.3 Selecciones (48):** hoy se muestran por bandera (`public/flags`). Revisar las 48 una por una contra la
  real y corregir las que estén mal; si Gino quiere escudos de federación en vez de banderas, queda anotado abajo.
- [ ] **Verifica:** lámina de capturas con todos los escudos/banderas (chico y grande) comparados uno por uno;
  `assets:check`.

### F9 — Cierre
- [ ] Borrar el HANDOFF y `docs/FEEDBACK-3.md`; `TODO.md` con el estado nuevo y el verde de referencia; memoria
  actualizada; línea en `/mnt/hera/Proyectos/gino-os/bot/diario.md` (`MMDD HHMM texto`, inglés telegráfico) y
  commit ahí.

### Pendiente de revisión con Gino
- **Datos de prueba en prod (19/11, error mío, sin daño):** un `pnpm build` suelto (env de prod) + `E2E_SKIP_BUILD=1`
  corrió el flow contra la API de prod entre 03:32 y 03:40 UTC: 10 invitados anónimos, 1 cuenta sintética
  `av_…@users.tanda2026.com.ar` (avatar.spec) y torneos con bots (terminan solos). Ningún dato real tocado. Se
  van con el wipe de F7 (con export). `flow.sh` ahora verifica que `.next` apunte a la API local o reconstruye.
- **Escena del penal (F3):** cámara dron fija con leve empuje; los avatares quedan chicos frente a la toma de atrás
  (es el costo de ver arco + área + medialuna). Si los querés más grandes: cerrar el cuadro (sin medialuna) o
  escalar los muñecos ×1,2.
- **Cierre anticipado del penal (F2.1, hecho):** el penal vuelve a resolverse solo al vencer el tiempo aunque
  respondan los dos (deshace la regla del 14/11). Alternativa si lo querés de vuelta: cierre anticipado + demorar
  solo el cartel (una línea en `resolve_penalty`).
- **Escudos de selecciones (F8.3):** hoy son banderas; el plan las revisa y corrige. ¿Querés además escudos de
  federación parecidos a los reales?
- **Cola ranked por Presence (F1.6):** cuenta a quien tiene abierta la pantalla de cola (= encolado). Es exacto y no
  toca la DB; la alternativa por DB costaba un COUNT por jugador cada 2 s.

## Cómo correr / testear / deployar
```bash
export PATH=$HOME/.npm-global/bin:$PATH           # pnpm no está en el PATH de las shells de Claude
pnpm dev | build | lint | typecheck | knip         # desarrollo + checks
pnpm test && pnpm test:components                  # unit (motor, avatar) + componentes (RTL)
pnpm db:start && pnpm db:reset && pnpm test:db     # suite SQL/RPC contra Postgres local (Docker)
pnpm test:e2e                                      # Playwright + axe sobre páginas públicas (smoke + layout)
pnpm e2e:stack && pnpm db:reset && pnpm test:e2e:flow   # flujo de juego contra Supabase LOCAL (nunca prod)
E2E_BASE_URL=https://tanda2026.com.ar pnpm test:e2e     # smoke contra prod
E2E_BASE_URL=https://tanda2026.com.ar E2E_PROD_GUEST=1 pnpm exec playwright test e2e/prod-guest.spec.ts
pnpm assets:check | perf:budget | questions:check | db:check-migrations | qa:avatar
```
- **Deploy front:** `git push origin main` → Vercel (gru1) → https://tanda2026.com.ar.
- **Deploy DB:** cada migración nueva por MCP `apply_migration` (orden por timestamp). El MCP la versiona con la
  hora real → reconciliar `supabase_migrations.schema_migrations` al nombre del archivo; después `get_advisors`
  (lo esperado: RLS sin policy en tablas de juego, RPC `SECURITY DEFINER` de juego, anon sign-ins).
- **Orden:** front primero si la migración depende del front nuevo; nunca dejar prod roto.

## Dónde vive cada cosa
- `lib/engine/` — motor TS puro y determinista (fuente de la regla). `lib/avatar/`, `lib/penal/` — avatar y jugada.
- `supabase/migrations/` — esquema + RPCs: fuente de verdad de la DB (baseline v2 del 13/11 + incrementales).
- `supabase/tests/` — suite del camino autoritativo (paridad TS↔SQL, anti-trampa, RLS, torneo, ranked).
- `app/` — rutas (Server Components; grupos `(app)`, `(game)`, `(auth)`), `components/` (UI; primitivas en
  `components/ui/`), `e2e/` (Playwright), `scripts/` (assets, catálogo, preguntas, QA, perf).
- Docs: `docs/BRIEF.md` (producto), `SPEC.md` (arquitectura/contratos), `docs/DESIGN-RULES.md`.

## Verde de referencia (17/11)
typecheck · lint · knip · assets · unit 209 · components 48 · db 108 · build · e2e 42 · flow 9 · smoke prod 42 +
penal de invitado en prod.
