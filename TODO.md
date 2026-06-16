# TODO — TANDA ⚽

`ESTADO ACTUAL: F2 + F3 COMPLETAS, F4 CORE LISTO (4.1→4.5+4.7+4.8), F5 5.0+5.1 LISTAS. F5 5.0: seed 48 naciones (top 48 ranking FIFA + tiers 10/10/10/18 + kits). F5 5.1: lib/engine/bot.ts (modelo §7.2, botIntent determinista por seeds derivados, 4 tests). 56 tests verdes. PRÓXIMO 5.2 (start_tournament: relleno bots + naciones + reparto humanos 1/grupo + 12 grupos + fixture) DEPENDE de la 6.1 (lib/engine/tournament.ts: grupos/fixture/puntos) → conviene construir el motor de torneo (F6 6.1) ANTES de cablear start_tournament. F4 4.1→4.5 + 4.7 + 4.8 LISTAS (4.6/4.6b POSPUESTAS a F5/F6 por decisión de Gino: el barrier entre partidos + posiciones en vivo necesitan fixture de start_tournament y standings; 4.9 anim GOL/ATAJADO es F8). F4 4.8: get_active_match (RPC) rehidrata tras refresh — torneo/partido en curso + penal abierto (sin correct_index, con my_option para restaurar selección) o null; <PenalLive>/<PenalDevHarness> retoman el partido al montar. E2E SQL OK. F4 4.7: tick() backstop por pg_cron cada 10s (resuelve penales vencidos sin poke; idempotente; un fallo no aborta el barrido). E2E SQL OK. Modelo de datos (10 tablas) + motor TS puro (penalty/match/rng, 39 tests). F4 4.5: resolve_penalty EN POSTGRES (plpgsql, NO Edge Function — decisión por escalabilidad; SPEC §1.2/§1.3 actualizado). Port fiel del motor §5.2 + RNG mulberry32 (paridad bit-perfect verificada). Lock FOR UPDATE SKIP LOCKED (idempotente, ráfaga de pokes = no-op), solo now()>=deadline (too_early), random seeded a ausentes, "los dos mal"→second_chance (5s, Broadcast penal:second_chance), si no resolved + marcador + penal:result (con correct_index+explanation revelados). Cliente <PenalLive>: poke a 0s + second_chance + pantalla GOL/ATAJADO. E2E SQL 10 escenarios OK. SIMPLIFICACIÓN: hoy todo no-respondedor = random (ausente); falta distinguir "presente que no eligió = fallo" (necesita presence, cerrar en 4.6/4.8). F4 4.4: select_option (RPC SECURITY DEFINER) — upsert de la última selección en penalty_answers con selected_at=now() server + is_correct server-side (lee correct_index, no viaja); NO resuelve (4.5); valida not_participant/penalty_closed/out_of_window/invalid_option; <PenalLive> con botones clickeables (resaltado + cambiable + bloqueo a 0). E2E SQL real 6 casos OK. F4 4.3: capa realtime de juego — Broadcast desde la DB (realtime.send dentro de RPC SECURITY DEFINER) a canal PRIVADO match:{id} (policy SELECT en realtime.messages vía realtime_match_member/is_match_member). open_penalty (lock pending→open, deadline=+10s server, emite penal:start sin correct_index). Cliente: lib/realtime/penal.ts (PenalStartPayload sin correcta + clockOffset/remainingMs, 7 tests) + <PenalLive> (setAuth + canal private + contador). Harness DEV temporal (F5/F8): dev_create_practice_penal + /dev/penal + <PenalDevHarness>. 52 tests; advisors sin lints nuevos; E2E browser OK (payload sin correct_index). Próximo: F5 (bots + naciones + start_tournament). Lo que queda de F4 está acoplado a fases posteriores y se hace allá: 4.6/4.6b (barrier de ronda + posiciones en vivo + open-next + presence) con F5/F6 cuando haya fixture/standings; 4.9 (animación GOL/ATAJADO) con F8 (escena 3D) — hoy <PenalLive> ya recibe penal:result con reason/variant/scored y muestra GOL/ATAJADO en texto. F5 arranca con 5.0 (seed de 48 naciones clasificadas 2026 + fifa_rank + tiers + kit_primary): es CONTENIDO con datos del mundo real → conviene confirmar enfoque/datos con Gino antes de seedear. F4 4.1: matchmaking por RPC SECURITY DEFINER (create_room/join_room/quick_play) + RLS de pertenencia (rooms/tournaments/participants), esquema de lobby (tournament 'pending', nation_id nullable), E2E real OK. F4 4.2: lobby vivo — RPC leave_room (cancela sala al irse el último humano; abandono sucio = tick() backstop F5/4.7), ruta /sala/[code] (server: auth + join_room idempotente) → <Lobby> client con Presence (canal room:{code}, track {userId,username}) + countdown contra starts_at (offset al montar) + Salir/Copiar código; menú mínimo en home (<PlayMenu>: Jugar/Crear/Unirse) + aviso de links inválidos; helpers puros lib/lobby/presence.ts (6 tests). typecheck/lint/build verdes, 45 tests; E2E SQL real de cancelación + matchmaking OK; probado en prod con 2 humanos. Fix matchmaking (post-prueba): quick_play/join_room respetan la ventana de 2min, no reanudan lobbies vencidos, "Jugar" cae en la sala abierta con más gente o crea; sin salas privadas. start_tournament (bots/naciones/grupos) queda para F5. PENDIENTE ops (recuperación en prod): cargar SUPABASE_SECRET_KEY/RESEND_API_KEY/NEXT_PUBLIC_SITE_URL en Vercel. Auth username, avatar 3D persistente, /perfil (editar jugador + email de recuperación + stats/historial), registro con username_available, recuperación de contraseña (email sintético intacto, recovery_email en user_metadata, /forgot→/auth/confirm→/auth/reset con admin generateLink + Resend). Historial usa stub getTournamentHistory hasta F3/F6. typecheck/lint/build verdes, 12 tests; E2E real OK (incl. admin generateLink con la secret key ya cargada). PENDIENTE antes de pushear (ops Gino): RESEND_API_KEY + verificar dominio en Resend (en progreso), NEXT_PUBLIC_SITE_URL en prod, SUPABASE_SECRET_KEY en Vercel. Avatar 3D ya chequeado a ojo en prod (OK). Capturados en docs: camiseta por nación y modo invitado (F4/F5/F8).`

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
- [ ] 4.6 Reloj de ronda con barrier por penal (espera segunda chance) + posiciones en
      vivo en el tiempo muerto + animación de duración fija (≤5s)
- [ ] 4.6b Offset de reloj cliente/servidor (barra fiel al `deadline`, no al reloj local)
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
- [ ] 4.9 Animación GOL/ATAJADO disparada por `penal:result`

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
- [ ] 5.2 Relleno de cupos con bots + naciones aleatorias + reparto de humanos 1 por grupo
- [ ] 5.3 `bot_intents` precomputados/materializados (incl. segunda chance y muerte súbita)
- [ ] 5.4 Botón Abandonar (`abandon`): participante → bot (dificultad por nación),
      usuario vuelve al home, penales en curso se resuelven como bot

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
- [ ] 6.4 `simulate_bot_match` instantáneo + avance event-driven con gate por fase
- [ ] 6.5 Marcadores en vivo en bracket (`score:live`)
- [ ] 6.6 Tests Vitest del torneo (grupos, terceros, desempates, mapeo, bracket, campeón)

## F7 · Banco de preguntas

- [ ] 7.1 Tabla `questions` + `tournament_questions` (no-repeat)
- [ ] 7.2 Generar 200+ preguntas correctas por dificultad/categoría
- [ ] 7.3 Seed script + asignación por fase (§9.3)
- [ ] 7.4 Asignación 1 pregunta por (ronda, penal-index) compartida; bot-only no consume

## F8 · UI / animaciones premium

- [ ] 8.1 Menú principal con botón "Jugar" (quick-play) + crear/unirse por código +
      botón "Jugar como invitado" → pantalla de nombre (`tanda_guest_name` en localStorage)
      → torneo de práctica vs bots con avatar masculino default; nada se persiste; CTA a
      crear cuenta al terminar (SPEC §8.4)
- [ ] 8.1b Modo práctica invitado: correr un torneo local sobre `lib/engine` (1 humano + 47
      bots) sin Realtime ni escrituras RLS; nación asignada → camiseta (SPEC §8.4)
- [ ] 8.2 Escena de penal 3D (R3F): cancha + arco + pelota + avatares pateador/arquero;
      tarjeta de pregunta 2D centrada con la escena atenuada/desenfocada detrás; aplicar
      color de nación a la **camiseta** del avatar (override `kitTop`), resto tal cual
- [ ] 8.3 Barra de tiempo (roja + vibración al final)
- [ ] 8.4 Animaciones 3D por causa: `goal` / `save` (estirada) / `miss_wide` (afuera),
      con variantes + colocación aleatoria por seed (procedurales: primitivas + pelota)
- [ ] 8.5 Bracket estilo mundial con marcadores en vivo + pre-partido
- [ ] 8.6 Resumen de fin de partido (marcador + penal a penal + "Jugar de nuevo"/"Inicio")
- [ ] 8.7 Audio (silbato/multitud/gol/atajada + mute, desbloqueo por gesto)
- [ ] 8.8 Responsive total (mobile + desktop) + transiciones entre pantallas
- [ ] 8.9 Compartir sala con Web Share API (fallback copiar código)
- [ ] 8.10 HUD de tanda (marcador, "Penal N de 5", pateás/atajás, opción resaltada)
- [ ] 8.11 Revelar correcta + `explanation` al resolver; "sos vos" en bracket/grupos
- [ ] 8.12 Pantalla campeón (trofeo/confeti) + teclado desktop (1/2/3) + prefs persistentes
- [ ] 8.13 Links de sala inválidos: mensaje claro + fallback a "Jugar"

## F9 · Pulido

- [ ] 9.1 Auditoría RLS + anti-trampa (correct_index nunca al cliente)
- [ ] 9.2 Estados carga / empty / error en cada vista
- [ ] 9.3 Accesibilidad (`prefers-reduced-motion`) + performance
- [ ] 9.4 Manejo de errores robusto
- [ ] 9.5 Rate-limit (`quick_play`/`select_option`/`abandon`) + resuscripción Realtime
      automática tras caída + disclaimer "no afiliado a FIFA"
- [ ] 9.6 Verificación end-to-end §12 + deploy final
