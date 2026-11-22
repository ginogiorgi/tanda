# SPEC — TANDA ⚽

> Especificación técnica autocontenida, al día con **feedback 4 (22/11/2026)**. Deriva de `docs/BRIEF.md`
> (fuente de verdad del producto): si algo de acá lo contradice, gana el BRIEF y se corrige este doc.
> Reglas de UI y layout en `docs/DESIGN-RULES.md`; auditoría de código y DB en `docs/AUDIT.md`; estado y
> comandos en `TODO.md`.

---

## 1. Arquitectura

### 1.1 Capas

```
┌──────────────────────────────────────────────────────────────┐
│  Cliente (Next.js App Router: RSC + "use client")            │
│  - UI, animaciones CSS, 3D (avatar + penal), Realtime         │
│  - NUNCA conoce correct_index ni decide resultados            │
│  - pokes con fire(); telemetría propia (client_events)        │
└───────────────┬──────────────────────────────────────────────┘
                │ Server Components / Route Handlers (sesión, /api/*)
                │ RPC SECURITY DEFINER (acciones de juego)
┌───────────────▼──────────────────────────────────────────────┐
│  Postgres: RPC plpgsql SECURITY DEFINER (lógica AUTORITATIVA) │
│  - port fiel del MOTOR TS (paridad bit a bit), now() server   │
│  - pg_cron: tick() 1 s, ranked_tick() 2 s, podas, ops-notify  │
└───────────────┬───────────────────────┬──────────────────────┘
                │                       │
┌───────────────▼──────────────┐   ┌────▼─────────────────────┐
│  Postgres (estado + RLS)      │   │  Realtime                │
│  tablas de juego deny-all     │──▶│  Broadcast (server→cli)  │
│  para el cliente              │   │  Presence (sala, cola)   │
└───────────────────────────────┘   └──────────────────────────┘
```

Front en Vercel (`gru1`, misma región que la DB en `sa-east-1`). **Sin Edge Functions.** El server de Next
solo lee sesión (`getSession()`, `getClaims` local) y atiende `/api/feedback` y `/api/ops/notify`.

### 1.2 El motor es TS puro y la fuente de la regla

`lib/engine/` (penal, partido, formatos, torneo, ranked, timing) son **funciones puras y deterministas**:
la aleatoriedad entra como seed (mulberry32), nunca `Math.random()`. Se testean con Vitest sin red.

El **camino autoritativo corre en plpgsql** (RPC `SECURITY DEFINER`), no en serverless: el reloj de ronda
sincroniza a todos los humanos al mismo `deadline` → N pokes simultáneos; una RPC in-DB con lock (las
perdedoras son no-op) escala mucho mejor que N funciones abriendo conexión. Las versiones SQL son **ports
fieles** del motor, verificados por **paridad** contra TS (`supabase/tests/parity.test.ts`, RNG bit-perfect).

El motor TS se usa en: los tests, la UI (textos, stakes de ranked, escalas de división, presentación) y como
referencia de la regla. El modo invitado NO corre client-side (§8.4).

### 1.3 Timing autoritativo

**Event-driven + resolución perezosa + cron de respaldo.** Cada fase de penal tiene `started_at` y `deadline`
fijados por el server. Todos los tiempos salen de **una sola fuente**: `TIMING` (`lib/engine/timing.ts`) ↔
`public.game_timing()` (paridad en `supabase/tests/timing.test.ts`; `pnpm db:check-migrations` rechaza
`interval 'N seconds'` sueltos en migraciones nuevas).

| Clave | s | Qué es |
|---|---|---|
| `penaltyS` | 10 | ventana de respuesta |
| `secondChanceS` | 5 | segunda chance (los dos erraron) |
| `revealS` | 1,6 | jugada sin cartel (hasta que la pelota queda quieta) |
| `resultCardS` | 2,5 | cartel GOL/ATAJADO + la correcta |
| `betweenPenalsS` | 4,1 | `revealS + resultCardS`: resultado → próximo penal |
| `betweenMatchesS` | 8,1 | jugada + cartel + ≥3 s de tabla + 1 s de poll |
| `presentationS` / `presentationBackstopS` | 7 / 10 | presentación del torneo (con humano / respaldo) |
| `groupsCloseS` · `bracketLeadInS` · `koGapS` | 4 · 4 · 2 | tablas finales · cruces · entre fases KO |
| `rankedVersusS` | 8 | cara a cara ranked |
| `queuePresenceS` · `queuePurgeS` | 8 · 15 | cola ranked: presente / purga |

Espera de sala por modo: `game_modes.lobby_seconds` ↔ `FORMATS[m].lobbyS` (30 s).

**El penal se resuelve recién a los 10 s**, aunque respondan los dos (feedback 3). La respuesta **no es
cambiable**: el primer tap queda fijo (`select_option` rechaza un cambio con `already_answered`) y la rapidez
se mide por su `selected_at` (server). El cliente congela el contador en el instante del tap.

La resolución es **idempotente** y se dispara por:
1. **Poke del cliente** al llegar a 0: `resolve_penalty`. El server valida contra **su** `deadline`.
2. **`tick()` de pg_cron (cada 1 s)**: resuelve penales vencidos, materializa `bot_intents`, abre rondas
   vencidas (`open_next_round`), arranca salas y avanza torneos.

Los pokes van con **`fire(req, label)`** (`lib/supabase/fire.ts`): el builder de PostgREST es **perezoso** y
`void supabase.rpc(...)` no manda nada (lint lo prohíbe). Con `label`, un error de PostgREST o de red queda en
la telemetría (§11.4).

**Reloj cliente/servidor:** el cliente estima su offset con `server_now` de cada fase y dibuja la barra
contra el `deadline` server.

**Revelado:** al llegar `penal:result` se juega la jugada SIN cartel; el sonido va cuando la pelota llega
(`BALL_T1`) y el cartel recién a `revealS`; queda `resultCardS` hasta el próximo penal.

### 1.4 Concurrencia de ronda (feedback 4, punto 20)

Dos penales de partidos distintos que vencen en el mismo instante se resolvían en transacciones paralelas y
cada `resolve_round` veía al otro todavía `open` → nadie fijaba `round_deadline` → torneo congelado.
`resolve_penalty`, `resolve_round` y `open_next_round` toman el **advisory lock de ronda del torneo** antes de
tocar filas (orden advisory → filas). Test con dos conexiones reales: `supabase/tests/round_race.test.ts`.

Contramedida: **watchdog en `tick()`**. Un torneo en estado muerto (partidos en curso, ningún penal abierto,
sin deadline) se destraba solo (`round_deadline = now()`) y queda en `ops_events` (`round_stall_healed`); los
fallos de los barridos se registran como `tick_error` (deduplicados por minuto). Los dos tipos avisan por
mail (§11.4).

### 1.5 Bot contra bot

Un partido sin humanos (`is_bot_only`) no corre el flujo temporizado: `simulate_bot_match` lo resuelve al
instante con el modelo probabilístico por dificultad y persiste el log penal a penal. Su resultado se revela
al ritmo de la ronda. No consume preguntas.

### 1.6 Realtime

100 % **Broadcast** emitido por las RPC (`realtime.send()`) en canales **privados** (policy sobre
`realtime.messages`: solo miembros) + **Presence** en la sala y en la cola ranked. Sin Postgres Changes.
Payloads controlados: nunca `correct_index` antes de `resolved`.

---

## 2. Modelo de datos + RLS

### 2.1 Tablas (`public`)

| Grupo | Tablas | Notas |
|---|---|---|
| Identidad | `profiles` | `username` único, `avatar jsonb` (v2), `fav_club_id`/`fav_nation_id`, `qa_keep` (QA: no se poda) |
| Catálogo | `game_modes`, `teams`, `questions` | `teams` con `mode_id`, kit y escudo; `questions` con `difficulty`, `topic`, `correct_index` **server-only** |
| Juego | `rooms`, `tournaments`, `participants`, `matches`, `penalties`, `penalty_answers`, `bot_intents`, `tournament_questions`, `user_seen_questions` | timestamps server; `tournaments.seed` gobierna sorteos y bots |
| Ranked | `ranked_seasons`, `ranked_players`, `ranked_queue`, `ranked_matches`, `ranked_season_results`, `awards` | §4.3 |
| Hinchas | `fan_counts` | contadores agregados por club/país |
| Operación | `rate_limits`, `feedback_reports`, `client_events`, `ops_events` | internas; podas por pg_cron (§11.4) |

Fuente de verdad del esquema: `supabase/migrations/` (baseline v2 del 13/11 + incrementales).

### 2.2 RLS

- **RLS habilitada en TODAS las tablas** (event trigger `ensure_rls` + test).
- Tablas de juego y operación: **RLS sin policy y sin grants al cliente** (deny-all). Se leen y escriben
  solo por RPC `SECURITY DEFINER` que revalidan pertenencia y ventana.
- Legibles por el cliente (una policy cada una): `profiles` (propio + co-participantes), `rooms`,
  `participants`, `tournaments` (miembros), `teams`, `game_modes`.
- La superficie ejecutable por `authenticated`/`anon` es una **allowlist** y la tabla legible también:
  `supabase/tests/rls_audit.test.ts` falla ante cualquier grant nuevo, y exige que toda RPC tipada en
  `lib/supabase/database.types.ts` esté en la allowlist (o en `SERVICE_ONLY`).

### 2.3 Auth

- **Login por username:** email sintético inmutable `<username>@users.tanda2026.com.ar`.
- `username_available(text)` (anon) devuelve solo un booleano.
- Email real opcional para recuperación en `user_metadata.recovery_email` (privado). Reset por username →
  `auth.admin.generateLink` + Resend → `/auth/confirm` → `/auth/reset`. Respuesta anti-enumeración.
- **Invitado = sesión anónima** (§8.4). La poda borra invitados inactivos a los 14 días (salvo `qa_keep`).
- Server: sesión SOLO con `getSession()`; `auth.getUser()` prohibido por lint.

---

## 3. Penal y partido

### 3.1 Penal

```
open ──(10 s)──▶ resolved                (GOL | ATAJADO)
  └── los dos mal ──▶ second_chance (5 s) ──▶ resolved
```

- **open:** `started_at`, `deadline = +penaltyS`, `bot_intents` precomputados, `penal:start` (pregunta + 3
  opciones, sin la correcta). Cada humano elige UNA vez.
- **Ausente** (desconectado) sin selección: al resolver se le asigna una opción **aleatoria** (seed,
  `is_random`). Un presente que no elige = timeout (falla).
- **Resolución** (`lib/engine/penalty.ts` ↔ SQL):
  1. Ambos bien → gana el más rápido (`selected_at`); empate exacto → sorteo por seed.
  2. Uno bien → gana ese.
  3. Los dos mal → **segunda chance**: a cada uno se le quita la opción que ÉL eligió (`removed_option_kicker`
     / `_keeper`), quedan 2 y 5 s; misma tabla, sin tercera chance (si vuelven a errar → ataja).
- **resolved:** `resolution` (outcome, `reason` = `goal`|`save`|`miss_wide`, `variant`, tiempos,
  `won_by_speed`) + `penal:result` con la correcta.

### 3.2 Partido

- **Grupos: 3 penales por lado**, se juegan todos y puede haber empate (3/1/0 pts, se guardan goles).
- **Eliminación y ranked: 5 por lado**, alternados; la tanda se corta cuando está decidida; empate →
  **muerte súbita** (de a uno por lado) hasta que uno meta y el otro no.
- Lógica en `lib/engine/match.ts` (`advanceMatch`) ↔ `engine_advance_match`.

### 3.3 Reloj de ronda

- Una **ronda** = jornada de grupos o fase de eliminación. El penal `k` abre a la vez en todos los partidos
  con humanos, con **la misma pregunta** (§4.2).
- **Barrier por penal:** el `k+1` abre cuando todos cerraron el `k` (una segunda chance hace esperar al resto
  ≤5 s). Entre penales del mismo partido: `betweenPenalsS`; entre partidos: `betweenMatchesS`.
- El server avisa el próximo arranque con **`round:next`** (`open_at`): el cliente pokea `open_next_round`
  justo ahí; `tick()` es el respaldo.
- **Grupos → KO:** `advance_tournament` marca `groups_closed_at` y deja ver las tablas finales `groupsCloseS`;
  recién ahí `build_knockout` + `bracketLeadInS` para ver los cruces.
- **Presentación:** arranca cuando el humano entra a `/partido` (`begin_presentation`), con respaldo.

---

## 4. Torneos y ranked

### 4.1 Modos (`game_modes`, `lib/engine/formats/`, front en `lib/modes/`)

- **Mundial (`worldcup`):** 48 selecciones, 12 grupos de 4 (round-robin), 1º y 2º + 8 mejores terceros → 32
  → dieciseisavos → … → final + 3er puesto.
- **Argentino (`arg`):** 30 clubes 2027, 2 zonas de 15, 5 fechas + interzonal, octavos → final sin 3er
  puesto. Desempate: puntos → penales convertidos → moneda por seed.
- **Humanos repartidos uno por grupo/zona**; el resto, bots. Desempates estilo FIFA (puntos, DG, GF, h2h,
  sorteo por seed); los terceros se asignan al bracket con una tabla determinista.
- `quick_play(p_mode)` une a la sala abierta con más humanos (o crea una); `create_room(p_mode)` /
  `join_room(code)` para jugar con amigos. Llenar la sala arranca ya; si no, a los `lobby_seconds`.

### 4.2 Preguntas

- Banco en `data/questions/*.json` (700 Mundial + 700 Argentina) → seed generado; `pnpm questions:check` en CI.
- Una pregunta por (ronda, penal), compartida por todos los partidos con humanos de la ronda; dificultad
  por fase; **sin repetición** en el torneo (`tournament_questions`), sin repetir `topic`, categoría distinta
  a la del penal anterior, y evitando lo que el usuario ya vio (`user_seen_questions`, poda periódica).

### 4.3 Ranked 1v1

- Partido = torneo `ranked` con un único match `final` (5 por lado + súbita) y cara a cara de `rankedVersusS`.
- **Elo** escala 400, **K = 32**, piso ±4 (`lib/engine/ranked.ts` ↔ `ranked_apply_result`). Divisiones:
  Potrero < 1300 ≤ Barrio < 1450 ≤ Ascenso < 1600 ≤ Primera < 1750 ≤ Libertadores < 1900 ≤ Leyenda.
  Base 1500. **Escudo:** al ascender, 3 derrotas que no te bajan de división.
- **Cola:** `ranked_enqueue`/`ranked_poll`/`ranked_cancel` + `ranked_tick` (2 s). Ventana de rating según la
  espera: ±300 (<10 s), ±600 (<20 s), cualquiera después; vale la mayor de las dos. Se prefiere no repetir
  `last_opponent` (preferencia, no regla: si es el único en la cola, toca). Presencia por Presence del canal
  de la cola (contar es gratis y no toca la DB).
- **Temporadas** Apertura (ene–jun) / Clausura (jul–dic): al cerrar se guarda la división final como
  premio (`awards`) y se reajusta el rating.
- Abandonar = derrota inmediata. Lectura: `get_ranked_me`, `get_ranked_match`, `get_ranking` (tabla de
  jugadores en `/ranking`).
- QA: `pnpm qa:ranked-sim` juega ranked reales con 6 invitados y verifica Elo, ventana y ranking (§10).

---

## 5. Contratos de RPC

Todas `SECURITY DEFINER`, `search_path = ''`, validan pertenencia y usan `now()`. Errores como excepción con
código (`rate_limited`, `already_answered`, …; traducción en `lib/errors.ts`).

| Función | Quién | Qué hace |
|---|---|---|
| `quick_play(p_mode)` · `create_room(p_mode)` · `join_room(code)` · `leave_room(code)` | cliente | salas (§4.1); reanuda si ya hay torneo activo |
| `begin_presentation(t)` | cliente | arranca la presentación (idempotente) |
| `get_active_match()` | cliente | torneo/partido/penal en curso del caller (con `my_option`), o `null`: rehidratación |
| `get_match_scene(m)` · `get_match_penals(m)` · `get_penalty_result(p)` | cliente | datos de la escena, tablero de penales, resultado (solo `resolved`) |
| `select_option(p, i)` | cliente | primer tap fijo, valida ventana; no resuelve |
| `resolve_penalty(p)` | cliente/cron | idempotente, solo con `now() ≥ deadline`; lock de ronda (§1.4) |
| `open_next_round(t)` | cliente/cron | abre la ronda vencida (no-op si no venció) |
| `abandon(m)` | cliente | el participante pasa a bot (en ranked: derrota) |
| `get_bracket(t)` · `get_tournament_history()` · `get_profile_stats()` | cliente | lecturas |
| `ranked_*`, `get_ranked_me`, `get_ranked_match(t)`, `get_ranking(n)` | cliente | §4.3 |
| `set_favorites` · `get_fan_ranking` (anon) · `lobby_favorite(mode)` | cliente | hinchas |
| `username_available(name)` | anon | registro |
| `log_client_event(kind, route, detail)` | cliente | telemetría, 30 / 10 min por usuario (§11.4) |
| `submit_feedback(…)` · `submit_auto_report(…)` | service role | reportes (`/api/feedback`) |
| `tick()` · `ranked_tick()` · podas · `ops_notify_poke()` | pg_cron | respaldo, matchmaking, retención, avisos |
| `start_tournament`, `open_round`, `resolve_round`, `advance_tournament`, `build_knockout`, `simulate_bot_match`, … | interno | revocadas al cliente (denylist en `rls_audit.test.ts`) |

### 5.1 Abandono ≠ desconexión

- **Abandonar** (botón, dos toques): definitivo; el participante pasa a bot con la dificultad de su equipo y
  el torneo sigue. En ranked cuenta como derrota.
- **Desconexión:** el juego no se pausa; mientras está ausente responde aleatorio; al volver,
  `get_active_match` rehidrata. **No hay auto-abandono.**

---

## 6. Canales Realtime

| Canal | Mecanismo | Eventos |
|---|---|---|
| `room:{code}` | Presence | quién está en la sala |
| `ranked:queue` | Presence | cuántos esperan en la cola |
| `match:{id}` (privado) | Broadcast | `penal:start`, `penal:second_chance` (opción quitada por lado), `penal:result` (con la correcta) |
| `tournament:{id}` (privado) | Broadcast | `score:live` (marcadores en vivo), `round:next` (`open_at` del próximo penal) |

### 6.1 Cliente del penal (`components/penal/PenalLive.tsx`)

Tres fuentes de la fase en curso: el broadcast, la rehidratación (`get_active_match`) y el **poll de 1 s del
padre** (`TournamentLive`/`RankedLive` → prop `serverPenal`). Se adopta **solo lo más nuevo**
(`isNewerPhase`: otro penal con `idx` mayor, o el mismo con una fase posterior) y al adoptar se reconcilia
todo el estado (resultado, cartel, selección, contador). Un poll que trae un penal ya resuelto se ignora.

- Canal caído (`CHANNEL_ERROR`/`TIMED_OUT`/`CLOSED`) → se descarta y se resuscribe con backoff (1, 2, 4, 8,
  15 s) y el token vigente; al volver a `SUBSCRIBED`, rehidrata. `setAuth` en cada `TOKEN_REFRESHED`.
- **Watchdog** (cada 1 s): sin `penal:start` pasado `betweenPenalsS + 3 s`, o sin resultado 3 s después del
  deadline → rehidrata y pokea (`open_next_round` o `resolve_penalty` + `get_penalty_result`). Si el server
  dice que el partido sigue vivo y nada avanza en 45 s → pantalla de error (§11.4), que reporta sola.
- La escena 3D vive en una posición fija del árbol: no se remonta entre fases (test de montajes + mismo
  `<canvas>` en e2e).

---

## 7. Anti-trampa y seguridad

- Timing y evaluación solo en el server; `correct_index` nunca viaja antes de `resolved` (ni REST ni
  Realtime: lo verifica `e2e/flow/game.spec.ts`). Las elecciones del rival tampoco.
- `select_option` valida ventana, pertenencia y fase; primer tap fijo; `selected_at` del server.
- Resolución solo con `now() ≥ deadline`.
- Rate limits en las RPC de cliente (`enforce_rate_limit`) y en los reportes.
- Sin secretos en el cliente (`SUPABASE_SECRET_KEY`, `RESEND_API_KEY`, `FEEDBACK_TO` solo server/CI).
- Headers: CSP **enforced** (`connect-src` solo el Supabase del build + `blob:`; `wasm-unsafe-eval` por el
  decoder de los GLB), `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`. Fixture
  e2e `_csp` falla ante cualquier violación.
- Repo privado, licencia propia. Assets: escudos que **se parecen** a los reales sin copiarlos; prohibido todo
  emblema, tipografía o mascota de FIFA / Mundial 2026.

---

## 8. Experiencia

### 8.1 Pantallas y calidad de vida

- **Pantallas y navegación:** mapa en `lib/nav/routes.ts` (título, padre, grupo; test que lo exige),
  navegación solo con `useNav()`. Layout único: scrollea el documento, footer en menú/sitio y **nunca en
  juego**; juego en `<GameStage>` (un viewport). Detalle en `docs/DESIGN-RULES.md`.
- **Home:** una acción (Jugar → `/jugar`: partida rápida por modo, ranked con su tarjeta de liga, salas con
  amigos) + ranking de jugadores y de hinchas.
- **Partido:** HUD con marcador, tablero de penales y rol (pateás/atajás); globo de sonido arriba a la
  derecha; teclado 1/2/3; cartel de papel translúcido con la correcta; tabla/zona entre partidos; resumen y
  modo espectador al quedar afuera; pantalla de campeón.
- **Audio:** solo SFX (silbato, gol, atajada, tensión), mute persistente, se desbloquea con el primer gesto.
- **Accesibilidad:** axe sin violaciones en las páginas públicas y de juego; `prefers-reduced-motion`
  respetado en animaciones CSS y en la escena 3D.
- **Reportar:** botón flotante en las pantallas de menú (bug / mejora → `/api/feedback`, mail con asunto fijo
  `[Tanda] Bug: …` / `[Tanda] Mejora: …`).

### 8.2 3D (solo creador de avatar y escena del penal)

- React Three Fiber, **code-splitteado** (solo esas dos rutas). Personaje **GLB CC0 de Quaternius**
  (`public/models/avatar/`, generado por `scripts/avatar/build-glb.mts`) **sin fallback 3D**: mientras baja,
  placeholder neutro (`Scene3DSkeleton`); si falla, error con reintento (`useGlbReady` decide antes de montar
  el canvas). La instancia nace posada (nunca T-pose).
- **Rig propio** (`lib/avatar/rig.ts`, clips por keyframes, con tobillos) traducido a huesos por `glbRig`.
  Jugada determinista por `reason` + `variant` (`lib/penal/shot.ts`): igual en todos los clientes.
- En el partido, la camiseta del avatar toma el kit del equipo (override de runtime, no se persiste).
- Bancos de prueba (404 en prod): `/dev/penal`, `/dev/avatar`, `/dev/kit`.

### 8.3 Festejos

Cinco festejos de gol (`lib/avatar/celebrations.ts`: Siuuu, al cielo, brazos cruzados, la cuna, rodillazo),
uno por penal según `penalty_id` (igual en todos los clientes); en el gol la cámara pasa a primer plano del
pateador (`celebrationCamera`). Ver `docs/celebrations.md`.

### 8.4 Modo invitado

Usuario **real efímero**: `signInAnonymously` con username `invitado_<9 dígitos>` y avatar default. Juega el
camino autoritativo real (mismo anti-trampa, salas, ranked). Sin password, recuperación ni creador de avatar;
CTA para crear cuenta. Requiere anonymous sign-ins habilitados en Auth. Se poda a los 14 días de inactividad.

---

## 9. Fuera de alcance

Chat, monetización, app nativa, i18n.

---

## 10. Verificación

| Comando | Qué cubre |
|---|---|
| `pnpm typecheck` · `lint` · `knip` | TS estricto (TS 7), reglas propias (tokens, `useRouter`, `fire`, `getUser`, imports), código muerto |
| `pnpm test` · `test:components` | motor, avatar, lógica pura · componentes (RTL) |
| `pnpm test:db` | camino SQL/RPC contra Postgres local: paridad, anti-trampa, RLS, torneos, ranked, carrera de ronda, telemetría |
| `pnpm test:e2e` | Playwright + axe + layout + CSP sobre páginas públicas (también contra prod) |
| `pnpm test:e2e:flow` | flujo real contra Supabase **local**: invitado → sala → partido, campeón, KO, ranked de 2 humanos, caos de red |
| `pnpm perf:budget` · `assets:check` · `questions:check` · `db:check-migrations` | presupuesto de JS por ruta (a mano), assets, banco, migraciones |
| `pnpm qa:ranked-sim` | 6 invitados en ranked real (por defecto, prod) con asserts de Elo/ventana/ranking |

---

## 11. Operación

### 11.1 Deploy

Front: `git push origin main` → Vercel. DB: cada migración por MCP `apply_migration`, reconciliando
`supabase_migrations.schema_migrations` al nombre del archivo, y después `get_advisors`. Si la migración
depende del front nuevo, front primero; nunca dejar prod roto.

### 11.2 pg_cron

| Job | Frecuencia | Qué |
|---|---|---|
| `tanda-tick` | 1 s | `tick()`: penales vencidos, bots, rondas, salas, avance, watchdog |
| `tanda-ranked` | 2 s | `ranked_tick()`: purga y emparejamiento, cambio de temporada |
| `tanda-ops-notify` | 1 min | `ops_notify_poke()`: si hay avisos pendientes, POST a `/api/ops/notify` (pg_net) |
| `tanda-cleanup-rooms` | 15 min | salas abandonadas |
| `tanda-guests-prune` · `tanda-ops-prune` · `tanda-seen-prune` · `tanda-feedback-prune` | diario | invitados 14 d · rate limits, bot_intents, `ops_events` y `client_events` 30 d · preguntas vistas · reportes 365 d |

### 11.3 Escala

El código y el SQL quedan listos; el "switch" es de infra (tier de Supabase). Índices para los barridos de
`tick()`; `quick_play` sin lock global (`FOR UPDATE SKIP LOCKED`); techos por vuelta en `tick()`. La app va
por el pooler en transaction mode. El techo de Realtime lo fija el tier (1000+ jugadores → Team o superior).
Diagnóstico: `pg_stat_statements` ordenado por `total_exec_time`.

### 11.4 Telemetría y errores (feedback 4, Fase F)

- **`client_events`** (`log_client_event`, rate limit): pokes que fallan (`rpc_error:<rpc>`), canal caído
  (`realtime:channel_down`), watchdog del penal (`penal:watchdog`, `penal:stall_fatal`). Muestreo en el cliente
  (`lib/telemetry/client.ts`): mismo tipo ≤1 por minuto, ≤20 por sesión. `setExternalReporter` es el gancho
  para Sentry.
- **Pantalla de error de marca** (`components/feedback/ErrorScreen`, `app/error.tsx`, `app/global-error.tsx`
  mínimo, juego trabado): "Hubo un error, perdón", Reintentar, Volver al inicio. **Reporta sola** al montarse
  (`POST /api/feedback` con `kind: "auto"`): `submit_auto_report` guarda una fila por **fingerprint** (mensaje
  + ruta + primer frame normalizados) con contador de ocurrencias y manda **como mucho un mail cada 24 h** por
  fingerprint. "Avisar de este bug" solo agradece.
- **Avisos del server:** el watchdog y los barridos escriben `ops_events`; `tanda-ops-notify` → pg_net →
  `/api/ops/notify` (URL en Vault `ops_notify_url`; sin URL no hace nada, como en local). La ruta no confía en
  quien la llama: lee los pendientes, manda un mail por tipo + torneo + paso cada 24 h y los marca.
- Todos los mails van a `FEEDBACK_TO` con el prefijo de asunto fijo.
