# TODO — TANDA ⚽

`ESTADO ACTUAL (handoff — al decir "seguí", arrancar acá):

>>> PRÓXIMA TAREA: F9 (pulido) — 9.1 y 9.2 HECHOS. Arrancar por 9.3 (accesibilidad: reduced-motion YA
   global en globals.css + perf), 9.4
   (manejo de errores robusto), 9.5 (rate-limit en quick_play/select_option/abandon + resuscripción
   Realtime tras caída — el disclaimer "no afiliado a FIFA" YA está en el home), 9.6 (verificación e2e
   §12 + DEPLOY final). OJO 4.6b (offset de reloj fiel) sigue pendiente (la barra de tiempo del penal ya
   lo usa; falta aplicarlo al tiempo muerto/round_deadline).
   >>> PENDIENTE 9.6: correr `get_advisors(security)` por MCP RECIÉN POST-DEPLOY de las 3 migraciones
   nuevas a prod (hoy el scan no las cubriría; decisión de Gino). El review estático + suite db ya
   blindan las RPC nuevas.

>>> HECHO 9.1 (auditoría RLS + anti-trampa): codificada como guardrail durable, no review de una vez.
   (1) Migración 20260617130000_rls_anticheat_hardening: tapó fugas de superficie por el GRANT default
   de PUBLIC — `abandon` quedaba ejecutable por `anon`; ~14 RPC de cliente (create_room/quick_play/
   join_room/select_option/resolve_penalty/get_*/dev_*) ejecutables por `anon` vía PUBLIC (todas exigen
   sesión salvo resolve_penalty, cuyo uid-null ES el backstop del cron → no explotable pero el backstop
   es para tick(), no anon); 9 helpers puros del motor (engine_imul/_mulberry32/_rand_int/_rand_bool/
   _hash32/_bot_intent/_advance_match, bot_penalty_scored, tanda_penalty_difficulty) sin revoke. Todo a
   authenticated-only (helpers de pertenencia is_*_member/realtime_*_member quedan para evaluar policies;
   username_available sigue anon). (2) Test supabase/tests/rls_audit.test.ts (5): RLS en TODA tabla de
   public; superficie ejecutable == allowlist (authenticated 21 / anon 6, set-equality → rompe ante grant
   accidental futuro); denylist de 31 mutadores internos NO ejecutables por cliente (generaliza el check
   de 4 de anticheat). Guardrail verificado (grant interno + disable RLS → 4 tests rojos). Estado verde:
   39 db + 100 unit + typecheck + lint. Las RPC nuevas de F8 ya validan pertenencia y no filtran
   correct_index (cubiertas por match_scene/bracket tests) → review estático OK, sin cambios.

>>> OPS ANTES DE PROBAR EN PROD: aplicar a la DB de prod las migraciones nuevas de este tramo
   (20260617100000_match_scene, _110000_bracket, _120000_match_penals, _130000_rls_anticheat_hardening)
   — hoy SOLO están en local (Docker) y verificadas por la suite db. Sin eso, /partido y el bracket no
   andan en prod, y la superficie de funciones no queda blindada (la _130000 es least-privilege puro,
   no rompe nada). Tras deployar: correr `get_advisors(security)` (9.6).

>>> HECHO este tramo (commits, F8 COMPLETO + 4.9): 8.2 escena de penal 3D + pantalla de partido real;
   8.5 bracket + pantalla TOURNAMENT-SCOPED (<TournamentLive>, gate get_active_tournament): alterna
   penal 3D (<PenalLive> + PenalScene low-poly, cámara penal-cam fija, camiseta teñida por nación vía
   AvatarModel kitTop) ↔ bracket 2D (<Bracket>: tu camino + "ver todo") en el tiempo muerto, gobernado
   por el reloj de ronda. 8.10 HUD (PenalHud: marcador+Penal N de 5+pateás/atajás). 8.3 barra de tiempo
   (TimeBar + vibración). 8.4+4.9 animaciones 3D goal/save/miss_wide (PenalScene useFrame por reason+
   variant). 8.6 RunSummary (fin de torneo + penal a penal vía get_match_penals + CTA invitado, cierra
   8.1). 8.12 campeón (Confetti + teclado 1/2/3 + lib/prefs). 8.7 audio sintetizado (lib/audio Web
   Audio + mute). 8.9 compartir sala (Web Share). 8.8 transiciones fade-in. 8.11/8.13 ya estaban.
   SERVER (3 migs, SOLO EN LOCAL aún): _match_scene, _bracket, _match_penals. Helpers puros
   lib/penal/scene.ts + lib/bracket/bracket.ts (+ tests). Estado verde: typecheck/lint/build, 100 unit
   + 34 db. PENDIENTE de Gino (visual, no bloquea): mirar a ojo el render WebGL de la escena de penal +
   animaciones, y el bracket + transición penal↔tiempo muerto, en un torneo real.

>>> PREVIO (commits): 9.0 (tests SQL/RPC + DB en CI; ver [[tanda-db-tests]]). 8.1 MODO INVITADO
   redefinido (Gino): usuario real efímero = sesión anónima + username autoasignado invitado_<9díg> +
   avatar default, juega el camino competitivo REAL (no torneo client-side; ver [[tanda-guest-anon]]).
   GuestButton + lib/guest/anon + gate avatar/perfil + upgrade invitado→cuenta (/register modo upgrade).
   8.1b (torneo local) DESCARTADO. anon sign-ins YA HABILITADO en prod. SPEC §8.4 reescrito. Para correr
   los tests DB: `pnpm db:start && pnpm db:reset && pnpm test:db` (necesita Docker).

>>> 9.0 DONE: suite repetible del camino autoritativo PLPGSQL con Postgres local de Supabase (Docker)
   + Vitest project `db` (pg directo) + job `db` en CI. 26 tests: paridad VIVA TS↔SQL (mulberry32/
   bot_intent/penalty_difficulty/fnv32, sin golden hardcodeado), anti-trampa (correct_index ilegible
   por anon/authenticated, escrituras solo por RPC, RPCs internas revocadas, broadcasts solo a
   miembros), e2e torneo 48 (start→driver fast-forward→campeón+3º, 72 grupos+32 KO, 0 cruce mismo
   grupo R32), reloj de ronda compartido (1 deadline), abandon (humano→bot, get_active_match deja de
   rehidratar, resuelve is_random=false). `pnpm test` sigue unit-only (88, sin Docker); `pnpm db:start
   && pnpm db:reset && pnpm test:db` para la suite DB. HALLAZGO arreglado: `db reset` desde archivos
   fallaba — faltaba la migración del event trigger `ensure_rls`/`rls_auto_enable` (se había aplicado
   out-of-band); agregada como 20260614090650 (idempotente, fiel al remoto) → historial autocontenido.
   Guardrail verificado (romper una constante de paridad en una migración → suite roja). DIFERIDO: tipar
   el cliente con `supabase gen types` (Database generic) queda como tarea aparte (9.x).

>>> CONTEXTO DURABLE (lo viejo de F2–F7 vive en el git log y en los checkboxes de abajo): el camino
   autoritativo (matchmaking → grupos con reloj de ronda → KO → campeón + abandon + score:live) está
   COMPLETO, en PLPGSQL (no Edge Functions; SPEC §1.2/§1.3) y blindado por la suite DB de 9.0. lib/engine
   (TS) = fuente de la regla; las versiones SQL son ports fieles verificados por paridad. El dev harness
   (/dev/penal, dev_create_practice_penal) es TEMPORAL (prueba penales sueltos) y se borra en F8 cuando
   exista la pantalla de partido real.

OPS PENDIENTE (Gino, no bloquea el código): cargar SUPABASE_SECRET_KEY/RESEND_API_KEY/
NEXT_PUBLIC_SITE_URL en Vercel + verificar dominio en Resend (para los mails de recuperación).`

> Una tarea a la vez, en orden. Al terminar cada una: verificar con output real
> (`typecheck`/`lint`/`build`/tests según aplique), tildar el checkbox, actualizar
> `ESTADO ACTUAL`, y hacer un commit descriptivo. No saltear.

---

## FASE 0 · Arranque

- [x] 0.1 Leer `docs/BRIEF.md` completo
- [x] 0.2 Entrevista de decisiones difíciles (timing, bots, realtime, auth)
- [x] 0.3 Escribir `SPEC.md`
- [x] 0.4 Escribir `PLAN.md`
- [x] 0.5 Escribir `TODO.md`
- [x] 0.6 Escribir `CLAUDE.md`
- [x] 0.7 Aprobación de Gino sobre SPEC/PLAN/TODO antes de codear

## F1 · Scaffold

- [x] 1.1 Inicializar Next.js (App Router) + TS estricto + pnpm
- [x] 1.2 Tailwind + design tokens paleta Mundial 2026 (CSS vars / theme) + fuente
- [x] 1.3 Estructura de carpetas (`app/`, `lib/`, `lib/engine/`, `supabase/`)
- [x] 1.4 Cliente Supabase (browser + server) y `.env.example`
- [x] 1.5 ESLint + tsconfig estricto + scripts (`dev/build/lint/typecheck/test`)
- [x] 1.6 CI GitHub Actions (typecheck + lint + build + test) — comandos verificados local
- [x] 1.7 Deploy "hello world" a Vercel (URL viva) → https://tanda-phi.vercel.app
      (dominio final tanda2026.com.ar, DNS propagando)

## F2 · Auth + Avatar + Perfil

- [x] 2.1 Migración + RLS de `profiles`; auth username (email sintético) — aplicada vía
      MCP, advisors security+performance en 0 lints
- [x] 2.2 Pantallas signup / login — http://localhost:300E2E verificado (signup→sesión, login→sesión, trigger
      crea el profile). Auth config: mailer_autoconfirm=true, secure_email_change=false
- [x] 2.3 Setup 3D: React Three Fiber + drei instalados; Canvas code-splitteado
      (`AvatarViewer`→`AvatarCanvas` vía `next/dynamic` ssr:false); catálogo de partes
      propio (`lib/avatar`) + `AvatarModel` (primitivas low-poly tintables). typecheck/lint/
      build verdes; 5 tests del catálogo. Render visual se valida al montarlo en 2.4
- [x] 2.4 Creador de avatar 3D: `AvatarCreator` (drag para rotar yaw + 4 selectores
      cabeza/pelo, remera, pantalón, zapatos con chips + paleta de color + toggle cuerpo
      base) montado en `/avatar` (auth-gated). typecheck/lint/build verdes; route 307→login
      OK. Render WebGL chequeado a ojo en prod (Gino): OK
- [x] 2.5 Guardar avatar (JSON en `profiles.avatar`) vía Server Action `saveAvatar`
      (revalida con `isValidAvatar`, escribe fila propia por RLS); `/perfil` (scaffold) con
      "Editar jugador" → `/avatar` (carga el avatar guardado, guarda y vuelve al perfil);
      chequeo de username disponible en el registro (RPC `username_available` SECURITY
      DEFINER + debounce). E2E real con publishable key: guarda/relee propio, RLS bloquea
      ajeno, RPC tomado/libre OK. typecheck/lint/build verdes, 6 tests
- [x] 2.6 Perfil: email real opcional + recuperación. Email sintético del login INTACTO; el
      real se guarda en `user_metadata.recovery_email` (`RecoveryEmailForm` → `updateUser`,
      no toca `auth.email`). Flujo de reset propio: `/forgot` → server action
      `requestPasswordReset` (admin `generateLink` + envío por Resend, anti-enumeración) →
      `/auth/confirm` (`verifyOtp`) → `/auth/reset` (`updateUser({password})`). Login linkea
      "¿Olvidaste tu contraseña?". typecheck/lint/build verdes; E2E real: `recovery_email`
      persiste sin pisar `username`. ⚠️ Ops para que envíe (ver supabase/README): cargar
      `SUPABASE_SECRET_KEY` (hoy vacío), `RESEND_API_KEY` + verificar dominio, `NEXT_PUBLIC_SITE_URL`
- [x] 2.7 Perfil: Historial + stats agregadas. Agregación pura y testeable
      (`lib/profile/history.ts` `aggregateStats` → títulos, win %, goles, mejor posición,
      torneos jugados; 6 tests). UI en /perfil: grid de stat cards + lista de historial con
      estado vacío ("todavía no jugaste"). Fuente `getTournamentHistory` es **stub hasta
      F3/F6** (las tablas de torneo no existen aún) → se enchufa sin tocar UI/agregación.
      typecheck/lint/build verdes, 12 tests

## F3 · Motor de partido (TS puro) + datos + tests

- [x] 3.1 Migraciones del modelo de juego (§2 SPEC) + RLS. 10 tablas (nations, questions,
      rooms, tournaments, participants, matches, penalties, penalty_answers, bot_intents,
      tournament_questions) + 9 enums + índices (incl. cobertura de todas las FKs).
      RLS auto-habilitada en las 10; `nations` SELECT para authenticated, `questions` sin
      SELECT (correct_index server-only). Resto deny-all hasta F4 (políticas de pertenencia
      + escrituras por RPC). Aplicada vía MCP; advisors sin ERROR/WARN nuevos (solo INFO
      esperados: deny-all + unused_index sin tráfico)
- [x] 3.2 `lib/engine/penalty.ts` (resolución pura, 6 casos §5.2). `resolvePenalty` pura y
      determinista + `rng.ts` (mulberry32 seeded). GOL/ATAJADO desde la óptica del pateador;
      `reason` = goal/save/miss_wide para la animación. 15 tests cubriendo las 6 filas.
- [x] 3.3 Segunda chance ("los dos mal", 5s, 2 opciones). Modelada en `penalty.ts`: 1ª fase
      "los dos mal" → `second_chance` quitando una opción incorrecta (la que ambos erraron, o
      una por seed); 2ª fase sin tercera chance (vuelven a errar / pateador no responde →
      gana el arquero). Tests incluidos. La ventana de 5s la impone el Edge en F4.
- [x] 3.4 `lib/engine/match.ts` (tanda de 5 por lado = 10, alternancia, muerte súbita).
      `advanceMatch` puro: home patea impares / away pares; grupos juegan los 10 (puede
      empatar, puntos 3/1/0); eliminación corta cuando está decidido + muerte súbita por
      rondas. Decisión 5-por-lado fijada en SPEC §3.2. 12 tests.
- [x] 3.5 Tests Vitest del motor: penalty.test (15, las 6 filas §5.2 + segunda chance +
      determinismo) + match.test (12, alternancia + grupos/empate + corte + súbita). 39
      tests totales verdes.

## F4 · Realtime

- [x] 4.1 `create_room` / `join_room` / `quick_play` + RLS de rooms/participants. RPCs
      SECURITY DEFINER: create_room (crea room lobby + tournament pending + participante
      host), join_room (por código, idempotente, errores room_not_found/room_full/
      already_started/room_cancelled), quick_play (reanuda activo / cae en lobby con más
      humanos / crea; advisory lock anti-carrera). RLS de pertenencia (rooms/tournaments/
      participants) vía helpers is_tournament_member/is_room_member. Esquema: tournament
      'pending' + nation_id nullable (lobby sin nación). E2E real OK (matchmaking + RLS
      bloquea ajeno). start_tournament (bots/naciones/grupos) = F5
- [x] 4.2 Lobby con Presence + countdown 2 min + cancelar sala sin humanos. RPC `leave_room`
      (SECURITY DEFINER): borra la fila del humano en lobby; si quedan 0 humanos → room
      `cancelled` (abandono sucio = tick() backstop F5/4.7). Ruta `/sala/[code]` (server:
      auth + `join_room` idempotente para links compartidos/refresh) → `<Lobby>` (client:
      canal `room:{code}` con Presence track de `{userId,username}`, countdown contra
      `starts_at` con offset estimado al montar, botón Salir/Copiar código). Menú mínimo en
      el home (`<PlayMenu>`: Jugar/Crear/Unirse por código) + aviso de links inválidos.
      Helpers puros `lib/lobby/presence.ts` (`formatRemaining`/`presenceMembers`, 6 tests).
      typecheck/lint/build verdes, 45 tests; E2E SQL real: 2 humanos → u2 sale (lobby) → u1
      sale (cancelled). Probado en prod con 2 humanos (crear+unirse por código OK). Fix
      matchmaking: quick_play/join_room respetan la ventana de 2min (no reanudan lobbies
      vencidos; "Jugar" cae en la sala abierta con más gente o crea; join nuevo tras los 2min
      → room_closed). Sin salas privadas (toda sala es pública y unible en los 2min)
- [x] 4.3 Broadcast `penal:start` (sin correcta) y suscripción cliente. Patrón de la capa
      realtime de juego (decisión): los eventos se emiten desde la DB con `realtime.send()`
      dentro de la RPC `SECURITY DEFINER` que cambia el estado; el cliente se suscribe a un
      canal **privado** `match:{id}` autorizado por policy SELECT en `realtime.messages`
      (`realtime_match_member`/`is_match_member` → solo participantes). RPC `open_penalty`
      (lock optimista `pending→open`, fija `started_at`/`deadline=+10s` server, emite
      `penal:start` con prompt+opciones **sin** `correct_index`). Cliente: helpers puros
      `lib/realtime/penal.ts` (`PenalStartPayload` sin correcta, `clockOffset`/`remainingMs`,
      7 tests) + `<PenalLive>` (`setAuth` + canal `private:true` + contador contra el
      `deadline` server). Harness DEV temporal (se reemplaza en F5/F8): RPC
      `dev_create_practice_penal` (room `cancelled` invisible al matchmaking + torneo + caller
      + bot + match + penal `pending`) + `/dev/penal` + `<PenalDevHarness>`. typecheck/lint/
      build verdes, 52 tests; advisors sin lints nuevos; E2E browser real: payload llega por
      canal privado SIN `correct_index`, contador 10s server
- [x] 4.4 `select_option` (respuesta cambiable, timestamp server, validaciones). RPC
      `SECURITY DEFINER`: registra/actualiza la ÚLTIMA selección del caller en
      `penalty_answers` (upsert por penalty+participant+phase) con `selected_at=now()` server e
      `is_correct` calculado server-side (lee `questions.correct_index`, que nunca viaja). NO
      resuelve (eso es 4.5). Valida pertenencia (`not_participant`), estado open/second_chance
      (`penalty_closed`), ventana `[started_at, deadline)` contra el reloj server
      (`out_of_window`), opción 0-2 y ≠ quitada en 2ª chance (`invalid_option`). Cliente:
      `<PenalLive>` con botones clickeables (resaltado de la elegida, cambiable, bloqueados al
      llegar a 0). typecheck/lint/build verdes, 52 tests; E2E SQL real (6 casos: selección,
      cambio, upsert 1 fila, invalid_option, not_participant, out_of_window) OK
- [x] 4.5 `resolve_penalty` a los 10s, idempotente, aleatoria a ausentes + encadenado.
      **Decisión de arquitectura (escalabilidad, 2026-06-16):** la resolución corre EN POSTGRES
      (plpgsql), NO en Edge Function — el reloj de ronda sincroniza el poke de todos los humanos
      al mismo deadline; RPC in-DB + lock optimista escala mucho mejor que N invocaciones
      serverless abriendo conexión c/u, y el backstop tick() (4.7) resuelve in-process sin
      pg_net. SPEC §1.2/§1.3 actualizado. El motor TS `lib/engine` sigue siendo la fuente de la
      regla (y corre el modo invitado client-side); la versión SQL es un PORT FIEL del RNG
      mulberry32 + tabla §5.2, **verificado por paridad** (7 seeds bit-perfect, incl. bordes).
      `resolve_penalty`: lock `FOR UPDATE SKIP LOCKED` (la ráfaga de pokes es no-op instantáneo,
      no espera), solo con `now()>=deadline` (`too_early`), random seeded a ausentes
      (is_random=true), aplica §5.2 → "los dos mal" en 1ª fase = `second_chance` (5s, 2 opciones,
      Broadcast `penal:second_chance`); si no, `resolved` + marcador del match + Broadcast
      `penal:result` (acá SÍ viaja correct_index+explanation, ya resuelto). Validación de
      pertenencia para el poke humano; uid null = backstop (tick). Helpers SQL `engine_imul/
      _mulberry32/_rand_int/_rand_bool/_hash32`. Cliente `<PenalLive>`: poke a 0s + manejo de
      second_chance (oculta la opción quitada, 5s) + pantalla GOL/ATAJADO con la correcta
      revelada. typecheck/lint/build verdes, 52 tests; E2E SQL real 10 escenarios (S1-S9: 6
      filas §5.2 + 2ª chance + ausente + idempotencia + too_early) OK + paridad RNG TS↔SQL.
      **Simplificación conocida (cerrar con presence en 4.6/4.8):** hoy CUALQUIER participante
      sin respuesta recibe random seeded (= ausente). El SPEC §5.2 distingue "humano presente
      que no eligió = fallo seguro" vs "ausente = random"; eso necesita presence del match (aún
      no existe). NO abre el siguiente penal: el encadenado entre penales/matches lo orquesta el
      barrier (4.6)
- [x] 4.6 Reloj de ronda con barrier por penal (espera segunda chance) + posiciones en
      vivo en el tiempo muerto + animación de duración fija (≤5s). SERVER (mig 20260616260000
      round_clock): round-driven (decisión de Gino). Los penales de la ronda (mismo idx) de TODOS
      los matches con humanos de la jornada/fase se abren JUNTOS en una transacción → comparten
      `now()+10s` = reloj de ronda compartido (now() es constante por transacción). `open_round_penals`
      (abre la ronda junta, reusa progress_match), `finalize_match` (resolve_penalty finaliza el match
      sin abrir el próximo penal), `resolve_round` (barrier: al cerrar TODOS los penales de la ronda
      —incl. 2ª chance— abre el tiempo muerto `tournaments.round_deadline=now()+5s`, o avanza si
      terminaron todos), `open_next_round` (poke del cliente al terminar el tiempo muerto, serializado
      por advisory lock + backstop en tick()). `open_round` simula bot-only + abre idx-1 junto.
      E2E SQL: 2 humanos en grupos distintos → sus penales idx-1 tienen 1 solo deadline (compartido);
      torneo completo (2 humanos + 46 bots) con barriers → campeón + 3º, 72 grupos + 32 KO, 0 sin
      terminar. typecheck/lint verdes, 88 tests. PENDIENTE F8 (UI, no bloquea el server): el cliente
      poke-ea `open_next_round` al terminar el tiempo muerto (hoy lo cubre tick() ≤10s) y muestra las
      posiciones en vivo (score:live de 6.5) + la animación durante el tiempo muerto. Va con la pantalla
      de partido/bracket (8.5/8.2). Reconexión durante el tiempo muerto: get_active_match devuelve
      penal=null (correcto), retoma al abrir la próxima ronda.
- [ ] 4.6b Offset de reloj cliente/servidor (barra fiel al `deadline`, no al reloj local).
      Helpers ya en lib/realtime/penal.ts (`clockOffset`/`remainingMs`); falta enchufarlos en la
      pantalla de partido real (F8) y aplicar el mismo criterio al tiempo muerto (`round_deadline`).
- [x] 4.7 `tick()` por `pg_cron` (backstop de penales/rooms). `tick()` (SECURITY DEFINER,
      revoke a public/anon/authenticated) barre penales `open`/`second_chance` con
      `deadline<=now()` (límite 200/tick) y llama `resolve_penalty` por el camino backstop (uid
      null → sin chequeo de pertenencia; igual exige now()>=deadline + idempotente con SKIP
      LOCKED, no choca con un poke simultáneo). Cada resolve va en sub-bloque con exception
      handler → un penal que falle no aborta el barrido. Agendado por pg_cron cada `10 seconds`
      (job `tanda-tick`, activo). E2E SQL: penal vencido sin poke → resolved; penal con deadline
      futuro → intacto; job agendado OK. PENDIENTE F5: sumar (a) materializar bot_intents
      vencidos y (b) reemplazar en el janitor "lobby vencido → cancelled" por "→ start_tournament
      si ≥1 humano, cancelar si no" (hoy cancela siempre porque start_tournament es F5)
- [x] 4.8 Reconexión: `get_active_match` rehidrata tras refresh. RPC `SECURITY DEFINER` que
      devuelve jsonb con el torneo/partido en curso del caller (match `in_progress`/
      `sudden_death` en torneo `in_progress`) + el penal abierto si lo hay (penalty_id, idx,
      prompt, options — **NUNCA correct_index** —, started_at, deadline, server_now,
      removed_option, phase, **my_option** = mi última selección para restaurar el resaltado), o
      `null` si no hay partido. Cliente: `<PenalLive>` rehidrata al montar (retoma el penal con
      su deadline server + selección, sin esperar Broadcast); `<PenalDevHarness>` re-monta el
      partido activo tras refresh. E2E SQL: rehidrata con my_option=2 y sin correct_index; penal
      null tras cierre terminal con match en curso; null sin partido
- [x] 4.9 Animación GOL/ATAJADO disparada por `penal:result` → HECHO junto con 8.4 (PenalScene
      procedural por reason+variant). La pantalla 2D GOL/ATAJADO + revelar correcta ya estaba (4.5/8.11).

## F5 · Bots

- [x] 5.0 Seed de `nations`: 48 + `fifa_rank` + accent/flag + `kit_primary`/`kit_secondary`.
      Pool = top 48 del ranking FIFA (16 jun 2026, Argentina #1 → Venezuela #48). Decisión:
      ranking FIFA como fuente (directiva de Gino) en vez de la lista literal de clasificados,
      para que el dato sea verificable. `difficulty_tier` por banda §7.2: 10 elite (top 10) /
      10 high (11-20) / 10 medium (21-30) / 18 low (31-48). `kit_primary`=camiseta titular
      (tiñe el avatar en el penal), `accent_color`=kit_primary, `flag_asset`=ISO-2
      (gb-eng/sct/wls para UK). Idempotente (on conflict code do nothing). Verificado: 48 filas,
      tiers 10/10/10/18, códigos+ranks únicos
- [x] 5.1 Modelo de dificultad por nación/ranking FIFA (§7.2). `lib/engine/bot.ts` puro:
      `TIER_MODEL` (elite 80%/2-5s, high 70%/2-6s, medium 60%/2-7s, low 50%/2-8s) +
      `botIntent(tier, seed)` → `{willBeCorrect, delayMs}` determinista. Usa **seeds derivados**
      (no llamadas encadenadas al RNG: willBeCorrect de `seed`, delay de `seed ^ const`) para
      que el port a plpgsql en 5.3 sea directo (engine_mulberry32(seed)). Lo usa el modo
      invitado client-side (§8.4) y se portará a SQL para `bot_intents` (5.3). 4 tests
      (determinismo, delay en rango, tasa de acierto ≈ tier sobre 20k seeds, orden de tiers)
- [~] 5.2 Relleno de cupos con bots + naciones aleatorias + reparto de humanos 1 por grupo.
      `start_tournament(p_room)` (plpgsql, no client-callable): claim optimista pending→ (lock
      SKIP LOCKED, idempotente), 0 humanos→cancela sala; reparte humanos 1/grupo round-robin,
      rellena bots hasta 4/grupo, asigna las 48 naciones (1 c/u sin repetir, sorteo por seed),
      arma 12 grupos + fixture round-robin (72 matches, bracket_slot=jornada, is_bot_only si
      ambos bots), pone tournament+room in_progress. E2E SQL (5 humanos): 48 part (5+43), 48
      naciones distintas, 12 grupos de 4, humanos 1/grupo, 72 matches (6/grupo), bot_only=57
      (verificado), idempotente. DEFERIDO (parcial): crear penales 1ª jornada (necesita banco
      F7) + simular bot-only + abrir 1ª jornada (6.4). WIRING LISTO: join_room dispara
      start_tournament al 48º; tick() (10s) arranca lobbies vencidos (≥1 humano) o cancela (0);
      janitor quedó solo para retención. OJO: el wire reescribió join_room preservando la ventana
      de 2min + columnas calificadas (el OUT param `tournament_id` es ambiguo si no se califica).
      E2E SQL: join 48º→in_progress; tick lobby vencido c/humano→in_progress (72 matches); sin
      humanos→cancelled
- [x] 5.3 `bot_intents` precomputados/materializados (incl. segunda chance y muerte súbita).
      `engine_bot_intent(tier, seed)` = PORT FIEL de `lib/engine/bot.ts` (paridad bit-perfect: 0
      mismatches en 40 casos = 4 tiers × 10 seeds, incl. bordes). `precompute_bot_intents(penalty)`
      (lo llama `open_penalty` al abrir y `resolve_penalty` al entrar en 2ª chance): calcula por bot
      del match cuándo responde (`scheduled_answer_at`, clamp al deadline), si acierta (% por tier
      §7.2) y qué opción (correcta, o incorrecta seeded excluyendo la quitada en 2ª chance), en
      `bot_intents`, determinista por seed del torneo. `materialize_bot_intents(penalty, force)`
      vuelca intents → `penalty_answers` (las vencidas, o todas si force): la usan el `tick()`
      (intents vencidos en la ventana) y `resolve_penalty` (force, al resolver). `resolve_penalty`
      AHORA: bots por su intent (is_random=false), random SOLO a humanos ausentes/desconectados
      (§3.1). Funciones internas con revoke a public/anon/authenticated. E2E SQL: precompute crea
      intents, resolve los materializa (random=0, opción coincide), "los dos mal" → 2ª chance con
      intents nuevos, tasas por tier ≈ §7.2 (elite .80/high .70/medium .60/low .50). typecheck/lint/
      build verdes, 83 tests, advisors sin WARN/ERROR nuevos.
- [x] 5.4 Botón Abandonar (`abandon`): participante → bot (dificultad por nación),
      usuario vuelve al home, penales en curso se resuelven como bot. RPC `abandon(p_match)`
      (SECURITY DEFINER, entra por match — el cliente ya tiene matchId): resuelve el torneo desde
      el match, marca al participante del caller `is_bot=true` (de ahí el bot juega con el tier de su
      nación §7.2, no random) y precomputa intents en sus penales abiertos (si ya respondió un penal,
      su respuesta queda; el bot toma desde el próximo). `get_active_match` ahora filtra `is_bot=false`
      → el que abandonó no se rehidrata (se queda en el home). Cliente: botón "Abandonar" en
      `<PenalLive>` (confirmación en dos toques) → `abandon` + `router.push('/')`. E2E SQL (usuario
      aislado): pasa a bot, penal abierto recibe intent de bot, get_active_match=null tras abandonar,
      y al resolver el ahora-bot juega por intent (`is_random=false`). typecheck/lint/build verdes, 83
      tests. (Desconexión ≠ abandono: la desconexión sigue siendo random hasta reconectar, §3.1.)

## F6 · Motor de torneo + tests

- [x] 6.1 `lib/engine/tournament.ts`: fixture, puntos (3/1/0, empate). `roundRobinSchedule<T>`
      (método del círculo: 4 equipos → 3 jornadas × 2 = 6 enfrentamientos, determinista) +
      `tallyGroup<T>` (acumula played/won/drawn/lost/GF/GA/GD/points; 3/1/0; incluye equipos sin
      jugar; NO ordena, eso es 6.2). 8 tests. La asignación a grupos (humanos 1/grupo) es de
      start_tournament (5.2)
- [x] 6.2 Clasificación: 2 por grupo + 8 mejores terceros + desempates FIFA (+ sorteo seed).
      `rankGroup(teams, results, seed)`: puntos→DG→GF→(entre empatados) h2h puntos→h2h DG→h2h
      GF→sorteo determinista (mini-tabla h2h con solo los partidos entre los empatados).
      `bestThirds(thirds, seed)`: rankea los 12 terceros por puntos→DG→GF→sorteo (sin h2h entre
      grupos), devuelve 8 qualified + 4 eliminated. Sorteo = `mulberry32(seed ^ fnv(id))` (último
      recurso, reproducible). 6 tests. (2 por grupo = los 2 primeros de rankGroup; lo arma 6.3)
- [x] 6.3 Mapeo determinista de terceros + bracket `round_of_32 → … → final`. `buildRoundOf32`
      (32 clasificados → 16 cruces; cada ganador de grupo vs un 2º/3º de OTRO grupo, restantes
      emparejados evitando mismo grupo; determinista por seed; garantiza no-cruce de mismo grupo
      en R32) + `advanceBracket<T>` (encadena fase: ganadores adyacentes 2k vs 2k+1) +
      `KO_PHASES`/`Qualified`. 6 tests. NOTA: evita mismo-grupo en R32; la evitación en rondas
      profundas (tabla oficial 2026) y el `third_place` (semifinalistas perdedores) quedan para
      el cableado de advance_tournament (6.4)
- [x] 6.4 `simulate_bot_match` instantáneo + avance event-driven con gate por fase.
      (a) `simulate_bot_match(match)` resuelve un partido bot-only al instante; `engine_advance_match`
      = PORT FIEL de lib/engine/match.ts; `bot_penalty_scored` = §5.2 bot-vs-bot. (b) `play_round`
      (mig 20260616220000): `open_penalty_internal` (apertura server-side sin auth), `assign_round_question`
      (1 pregunta por (ronda, penal-index) COMPARTIDA, no-repeat), `progress_match` (encadena penales
      dentro del match con engine_advance_match), `open_round`/`advance_tournament` (abre la jornada:
      bot-only al instante, humanos abren 1er penal; avanza de jornada). Cableado: start_tournament
      arranca jornada 1; resolve_penalty encadena match + avanza torneo; tick() restaura barrido de
      lobbies vencidos + destraba torneos sin match en curso. Fix E2E: progress_match casteaba status a
      text → ::match_status. (c) `advance_knockout` (mig 20260616230000): `engine_fnv32` (port FIEL de
      hashStr FNV-1a, para drawKey), `engine_group_standings` (port de rankGroup: puntos→DG→GF→h2h→
      sorteo seed), `build_knockout` (2 por grupo + 8 mejores terceros = 32 → buildRoundOf32 con
      evasión de mismo grupo → 16 matches R32), `advance_ko_round` (advanceBracket 2k/2k+1 → R16→QF→SF
      → 3er puesto en semis → final → corona campeón + 3er puesto + placements/eliminated_phase + cierra
      torneo/sala), `advance_tournament` reescrita (gate por fase completo, idempotente). E2E SQL real
      (1 humano + 47 bots, fast-forward): 72 grupos finished/3 jornadas → R32(16)→R16(8)→QF(4)→SF(2)→
      3er puesto(1)→final(1) → campeón+3º seteados, sala finished; invariantes: 0 cruces mismo-grupo en
      R32, 32 clasificados distintos, 48 participantes contabilizados (placements 1-4 + eliminated_phase),
      desempate h2h verificado (P1=P2 en pts/DG/GF, P1 ganó h2h → P1 1º). typecheck/lint verdes, 83
      tests, advisors sin WARN/ERROR nuevos.
- [x] 6.5 Marcadores en vivo en bracket (`score:live`). Canal privado `tournament:{id}` (policy
      `tournament_broadcast_select` en realtime.messages vía `realtime_tournament_member`/
      `is_tournament_member` → solo participantes del torneo). `emit_score_live(match)` emite el estado
      del partido (fase, group_letter, bracket_slot, status, marcador, ganador + `participant_brief` de
      cada lado: nación/código/bandera/kit) al canal del torneo; nada sensible. Cableado: `open_round`
      (fixture al abrir la ronda para matches con humano), `simulate_bot_match` (marcador final bot-only),
      `resolve_penalty` (penal a penal + cierre). Cliente: `lib/realtime/score.ts` (tipos `ScoreLivePayload`/
      `ParticipantBrief` + reducer puro `applyScoreUpdate` último-gana por server_now + `matchesInPhase`,
      5 tests) listo para que F8 8.5 se suscriba. E2E SQL: 25 `score:live` al topic del torneo en la
      jornada 1, payload completo con naciones (ej. "POR 3-1 NGA [finished]"). typecheck/lint/build
      verdes, 88 tests, advisors sin lints nuevos (solo `realtime_tournament_member`, espejo del de match).
      Pendiente F8: la UI de bracket consume el canal; el RPC `get_bracket` (carga inicial de estructura)
      se define con 8.5 cuando se conozcan las necesidades del render.
- [x] 6.6 Tests Vitest del torneo (grupos, terceros, desempates, mapeo, bracket, campeón). 26
      tests en tournament.test.ts: fixture/puntos (6.1), desempates+terceros (6.2), bracket
      (6.3), + integral 6.6: torneo completo 48→12 grupos→32 clasificados→bracket 16→8→4→2→1→1
      campeón, reproducible por seed. 78 tests totales verdes

## F7 · Banco de preguntas

- [x] 7.1 Tabla `questions` + `tournament_questions` (no-repeat). Esquema ya existía (game_model);
      + `questions.source_key` (única, nullable) para seed idempotente estilo `nations.code`.
- [x] 7.2 Generar 200+ preguntas correctas por dificultad/categoría. 220 preguntas factuales (solo
      Mundiales, hasta 2022), 6 categorías §9.1, distribución easy 60/medium 60/hard 55/very_hard 45.
      `correct_index` rotado 0/1/2 (74/73/73) → sin patrón explotable. Sin marcas/mascotas FIFA.
- [x] 7.3 Seed script + asignación por fase (§9.3). Migración insert idempotente
      (`on conflict (source_key) do nothing`). Regla de dificultad por fase en `lib/engine/
      difficulty.ts` (`penaltyDifficulty(phase, idx)`, fuente de la regla, 5 tests) + PORT SQL
      `tanda_penalty_difficulty` verificado por PARIDAD (0 mismatches en 7 fases × idx 1-5).
- [x] 7.4 Asignación 1 pregunta por (ronda, penal-index) compartida; bot-only no consume.
      `take_tournament_question(tournament, difficulty, seed)` (SECURITY DEFINER, revoke a
      public/anon/authenticated): elige pregunta no usada por el torneo (no-repeat vía
      `tournament_questions`), determinista por seed, fallback a dificultad adyacente si se agota
      el pool. NO crea penales todavía (eso es 6.4) — entrega el primitivo + contrato documentado.
      E2E SQL: no-repeat OK, determinismo (mismo seed→misma secuencia), fallback sin error,
      advisors sin WARN/ERROR nuevos. typecheck/lint/build verdes, 83 tests.

## F8 · UI / animaciones premium

- [x] 8.1 Menú principal con botón "Jugar" (quick-play) + crear/unirse por código (YA estaba en
      `<PlayMenu>` de F4) + botón **"Jugar como invitado"**. REDEFINIDO (Gino, jun 2026): el invitado
      es un **usuario real efímero** = **sesión anónima** de Supabase con username autoasignado
      `invitado_<9 díg>` + avatar default (metadata → trigger arma el profile) y juega el **camino
      competitivo real** (NO torneo client-side). Hecho: `lib/guest/anon.ts` (`generateGuestUsername`
      +1 test, `signInAsGuest` con reintento) + `<GuestButton>` en el home (no logueados) +
      `enable_anonymous_sign_ins=true` en config.toml. Verificado: trigger crea profile anónimo OK;
      typecheck/lint/build, 89 unit + 26 db. GATE de anónimos HECHO: /avatar redirige al invitado (queda
      con DEFAULT_AVATAR masculino), /perfil le muestra versión "sos invitado" + CTA "Creá una cuenta"
      (sin editar avatar / sin recuperación / sin historial), y el home lo saluda como invitado con CTA a
      crear cuenta. UPGRADE anónimo→permanente HECHO: /register detecta sesión anónima y muestra modo
      upgrade (updateUser email sintético+password+username + update de profiles.username), mantiene
      id/profile/avatar; /register ya no rebota al anónimo. CTA de cierre al terminar el torneo HECHO en
      8.6 (RunSummary muestra "Creá una cuenta" al invitado). **OPS PENDIENTE (Gino, dashboard): habilitar anonymous sign-ins en PROD —
      NO por `config push` (pisaría site_url/SMTP de prod); toggle puntual.** SPEC §8.4 reescrito.
- [x] 8.1b ~~Modo práctica invitado: torneo local sobre `lib/engine`~~ **DESCARTADO**: el invitado va
      por el camino real (8.1). No se bundlea el banco de preguntas al cliente (expondría la clave de
      respuestas → cheat en partidas reales). Tarea anulada.
- [x] 8.2 Escena de penal 3D (R3F) + **pantalla de partido real**. Cámara penal-cam clásica fija
      (detrás del pateador → arco; arquero de frente), decisión de Gino. Escena estática (poses idle;
      animaciones goal/save/miss_wide y barra de tiempo = 8.3/8.4/4.9). `components/penal/PenalScene`
      (low-poly: césped/arco/red/pelota + 2 `AvatarModel`) code-splitteado vía `PenalSceneViewer`
      (`next/dynamic` ssr:false, espejo de AvatarViewer). `AvatarModel` ahora acepta `kitTop?` →
      tiñe SOLO la camiseta con el `kit_primary` de la nación (§8.3 #1; resto del avatar tal cual).
      `<PenalLive>` monta la escena full-bleed detrás de la tarjeta atenuada/desenfocada (menos
      atenuada al resolver). SERVER (mig 20260617100000_match_scene): `get_match_scene(match)`
      (SECURITY DEFINER, GRANT authenticated, valida is_match_member; reusa `participant_brief` +
      avatares de profiles; bot/sin user → avatar null → DEFAULT_AVATAR) + `kicker/keeper_participant_id`
      en `penal:start` (open_penalty_internal) y en `get_active_match.penal` (la 2ª chance arrastra los
      roles en el cliente, mismo penalty_id → no se tocó la enorme resolve_penalty). Helper puro
      `lib/penal/scene.ts` (`resolveSceneRoles`, 5 tests). PANTALLA REAL: ruta `app/partido` (resuelve
      el match activo con get_active_match), transición lobby→partido (polling al vencer el countdown
      → router.push), CTA "Volver al partido" en el home. /dev/penal SE MANTIENE (test aislado; sin
      nación → kitTop null usa el top del avatar). typecheck/lint/build verdes, 94 unit + 29 db
      (get_match_scene rechaza no-miembro + no fuga correct_index; e2e confirma correct_index no viaja).
- [x] 8.3 Barra de tiempo (roja + vibración al final). `components/penal/TimeBar.tsx` montada en
      <PenalLive>: se vacía contra el `deadline` server corregido por offset (clockOffset/remainingMs,
      ya existentes → 4.6b cubierto para el penal); verde→ámbar→roja, pulsa en rojo en el último tramo
      (motion-safe). Vibración `navigator.vibrate(180)` una vez al entrar en los últimos 3s (guard de
      soporte). totalMs = deadline − started_at (10s 1ª fase / 5s 2ª chance). typecheck/lint/build verdes.
- [x] 8.4 Animaciones 3D por causa (+ 4.9). Procedural en `PenalScene` con `useFrame` (sin rig):
      al llegar `penal:result` se juega según `reason`+`variant` → `shotPlan` deriva la colocación
      (izq/der × bajo/alto por variant) y la dirección de la estirada. `goal` = la pelota entra al
      ángulo y el arquero vuela al lado equivocado; `save` = el arquero llega y la rechaza; `miss_wide`
      = afuera del palo/por arriba. Pelota con arco (sin·π), pateador con pasito de aproximación,
      arquero con estirada+salto+lean. PenalLive pasa `{reason,variant}` a PenalSceneViewer→PenalScene
      y muestra la escena casi sin atenuar + GOL/ATAJADO. typecheck/lint/build verdes.
- [x] 8.5 Bracket estilo mundial con marcadores en vivo + pre-partido. La pantalla de partido pasó a
      ser TOURNAMENT-SCOPED (`<TournamentLive>`, ruta /partido gateada por `get_active_tournament`):
      te sigue de grupos a la final y alterna entre la tarjeta de penal + escena 3D (cuando hay penal
      abierto) y el BRACKET en vivo + el VS de tu próximo partido en el TIEMPO MUERTO entre rondas
      (decisión Gino; absorbe el pendiente de 4.6). Transición gobernada por el server (reloj de
      ronda), no por timer: get_active_match.penal != null → penal; si no → bracket (con linger 3.5s
      tras el resultado para ver GOL/ATAJADO). Bracket 2D (`components/bracket/Bracket.tsx`): vista
      "tu camino" (VS próximo + tu grupo + tu rama KO) + botón "Ver todo el torneo" (12 grupos + árbol
      R32→final). Naciones por código + color de kit (sin assets FIFA). Datos: `get_bracket` (foto
      inicial, refrescada c/5s) + canal privado `tournament:{id}` (score:live de 6.5) mergeado con
      applyScoreUpdate. SERVER (mig 20260617110000_bracket): `get_active_tournament()` (gate que
      sobrevive al hueco entre partidos: torneo in_progress donde sigo jugando, no eliminado/coronado)
      + `get_bracket(tournament)` (participants con brief+grupo+placement+eliminated_phase + matches
      forma score:live, valida is_tournament_member). Helper puro `lib/bracket/bracket.ts`
      (`buildBracketView`: rankea grupos con rankGroup del motor, árbol KO por fase, tu camino/próximo
      rival; seed NO viaja → orden visual entre empates totales aprox., la clasificación real la fija
      el server por placement/eliminated_phase; 6 tests). El lobby ahora navega a /partido al arrancar
      el torneo (polling get_active_tournament) y el home muestra "Volver al partido". typecheck/lint/
      build verdes, 100 unit + 33 db (get_bracket/get_active_tournament: miembro vs no-miembro, sin
      fuga correct_index). PENDIENTE de Gino (visual): mirar a ojo el bracket + la transición penal↔
      tiempo muerto en un torneo real.
- [x] 8.6 Resumen de fin de partido (+ CTA cierre invitado, cierra 8.1). `components/penal/RunSummary.tsx`:
      lo muestra `<TournamentLive>` cuando mi corrida terminó (mi participante con eliminated_phase o
      placement seteado en el snapshot de get_bracket). Marcador final del último partido (fase más
      avanzada donde jugué) + penal a penal (RPC `get_match_penals(match)`, mig 20260617120000, dots
      gol/erró por lado, valida is_match_member) + desenlace (Campeón/Subcampeón/3º/4º/Eliminado en X)
      + "Jugar de nuevo" (quick_play→/sala/code) / "Inicio". Si es invitado, CTA "Creá una cuenta"
      (cierre del pendiente de 8.1). Campeón muestra versión base (trofeo/confeti dedicado = 8.12).
      typecheck/lint/build verdes, 100 unit + 34 db (get_match_penals: miembro vs ajeno).
- [x] 8.7 Audio. `lib/audio.ts` SINTETIZADO con Web Audio API (sin assets externos): silbato al abrir
      el penal, repique+multitud en gol, golpe en atajada. unlockAudio() en el primer gesto (onSelect)
      por la política del navegador. Mute persistente (lib/prefs) con botón 🔊/🔇 en la tarjeta de
      PenalLive. typecheck/lint/build verdes.
- [x] 8.8 Responsive total + transiciones entre pantallas. Transición `fade-in` (keyframe
      tanda-fade-in en globals.css, neutralizada por reduced-motion) aplicada a las vistas que se
      alternan: tarjeta de penal, resultado, bracket y resumen. Layout ya mobile-first (max-w-md
      centrado, escena 3D full-bleed, bracket scrolleable). typecheck/lint/build verdes. (Ajustes
      finos de breakpoints se pueden pulir a ojo en F9/9.3.)
- [x] 8.9 Compartir sala con Web Share API (fallback copiar código). Botón "Compartir" en el Lobby:
      `navigator.share({title,text,url})` con la URL /sala/{code}; si no hay Web Share o se cancela,
      cae a copiar el código (onCopy). typecheck/lint/build verdes.
- [x] 8.10 HUD de tanda. `components/penal/PenalHud.tsx` montado sobre la tarjeta de `<PenalLive>`:
      marcador en vivo (nación + color de kit + goles), "Penal N de 5" (`Math.ceil(idx/2)`; >10 =
      "Muerte súbita") y badge PATEÁS/ATAJÁS (compara my_participant_id de get_match_scene con
      kicker/keeper del penal). El marcador se trackea en PenalLive desde get_active_match (inicial) +
      penal:result (home_score/away_score). El resaltado de la opción elegida ya estaba en PenalLive
      (4.4). typecheck/lint/build verdes.
- [x] 8.11 Revelar correcta + `explanation` al resolver (PenalLive estado resuelto, 4.5) + "sos vos"
      en bracket/grupos (Bracket: TeamChip isMe → color gold + "(vos)", filas de grupo resaltadas, 8.5).
- [x] 8.12 Pantalla campeón (trofeo/confeti) + teclado desktop (1/2/3) + prefs persistentes.
      RunSummary campeón: 🏆 grande + `<Confetti>` (piezas absolutas con keyframe tanda-confetti en
      globals.css, posiciones deterministas; lo neutraliza prefers-reduced-motion). Teclado: PenalLive
      escucha 1/2/3 → onSelect (guard de tiempo por remainingRef, respeta opción quitada en 2ª chance).
      Prefs: `lib/prefs.ts` (mute en localStorage, defensivo SSR; lo consume el audio 8.7).
      prefers-reduced-motion ya respetado globalmente en globals.css. typecheck/lint/build verdes.
- [x] 8.13 Links de sala inválidos: mensaje claro + fallback a "Jugar" (sala/[code] redirige a
      /?aviso=<motivo>; home muestra AVISOS + PlayMenu con "Jugar"; hecho en F4 4.2/4.1).

## F9 · Pulido

- [x] 9.0 **(HECHO)** Tests automáticos del camino autoritativo SQL/RPC + DB en CI. Hoy los
      ports PLPGSQL (lo más crítico) solo se probaron con E2E manuales por SQL ya borrados → cero
      regresión automática. Codificar como suite repetible (pgTAP en `supabase/tests/` vía
      `supabase db test`, o Vitest contra un Supabase local/branch efímero):
      (a) **E2E de torneo**: `start_tournament` → drive (vencer deadlines + `tick`/`open_next_round`)
          → campeón + 3er puesto; 72 grupos + 32 KO; reproducible.
      (b) **Reloj de ronda compartido**: N humanos en grupos distintos → 1 solo `deadline` en la ronda.
      (c) **abandon**: humano → bot (is_bot=true), intent de bot en penal abierto, `get_active_match`
          deja de rehidratarlo, resuelve con `is_random=false`.
      (d) **Paridad TS↔SQL** (automatizar lo verificado a mano): RNG mulberry32, `engine_bot_intent`,
          `tanda_penalty_difficulty`, `engine_group_standings`/`buildRoundOf32` (no-cruce mismo grupo).
      (e) **Anti-trampa (§ gotchas)**: `anon`/`authenticated` NO puede `select questions.correct_index`,
          NO puede escribir tablas de juego (solo por RPC), NO puede leer broadcasts de otro match/torneo
          (policies de realtime.messages). `correct_index` no viaja en `penal:start`/`score:live`.
      (f) **CI**: levantar Supabase local, aplicar migraciones y correr (a)-(e) en GitHub Actions
          (hoy CI solo corre typecheck/lint/build/test TS). Atrapa migraciones rotas antes del merge.
      Side-effect útil: forzar reconciliar el historial de migraciones (squash) para que `db reset`
      desde archivos == remoto (ver memoria `tanda-sql-migrations-canonical`). Generar tipos de la DB
      (`supabase gen types`) para tipar las `supabase.rpc(...)` del cliente puede entrar acá o aparte.
- [x] 9.1 Auditoría RLS + anti-trampa (correct_index nunca al cliente). Codificada como guardrail
      durable: `supabase/tests/rls_audit.test.ts` (RLS en toda tabla de public + superficie ejecutable
      == allowlist por rol + denylist de mutadores internos). Hardening de superficie (mig
      20260617130000): `abandon` y ~14 RPC de cliente + 9 helpers puros del motor que quedaban
      ejecutables por `anon`/PUBLIC vía el grant default → authenticated-only (least-privilege; ninguna
      era explotable). Las RPC nuevas de F8 ya validaban pertenencia y no filtran `correct_index`.
      `get_advisors(security)` se corre en 9.6 post-deploy (las migraciones nuevas no están en prod aún).
      39 db + 100 unit + typecheck + lint verdes; guardrail verificado.
- [x] 9.2 Estados carga / empty / error en cada vista. Pasada por todas las vistas: las server pages
      ya redirigían con `?aviso=` (sala/[code], partido→no_match) y /perfil ya tenía empty state de
      historial; PlayMenu/Lobby ya tenían loading + errores mapeados (patrón de referencia). Agregado:
      `app/error.tsx` (boundary raíz: captura excepciones de render/RPC en cualquier ruta anidada →
      fallback con Reintentar + Inicio, antes era pantalla en blanco) + `app/not-found.tsx` (404
      amistoso). `<TournamentLive>` ya no queda en "Cargando…" para siempre si falla la carga inicial
      de get_bracket → estado de error con reintento (refrescos posteriores fallidos se ignoran si ya
      hay snapshot). `<RunSummary>` ahora muestra el error de quick_play (antes silencioso).
      typecheck/lint/build verdes, 100 unit.
- [ ] 9.3 Accesibilidad (`prefers-reduced-motion`) + performance
- [ ] 9.4 Manejo de errores robusto
- [ ] 9.5 Rate-limit (`quick_play`/`select_option`/`abandon`) + resuscripción Realtime
      automática tras caída + disclaimer "no afiliado a FIFA"
- [ ] 9.6 Verificación end-to-end §12 + deploy final
