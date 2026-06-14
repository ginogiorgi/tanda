# SPEC — TANDA ⚽

> Especificación técnica autocontenida. Deriva de `docs/BRIEF.md` (fuente de verdad del
> producto) y de las decisiones de arquitectura cerradas en la FASE 0. Si algo acá
> contradice al BRIEF, gana el BRIEF y hay que corregir este doc.

---

## 1. Arquitectura

### 1.1 Capas

```
┌─────────────────────────────────────────────────────────────┐
│  Cliente (Next.js App Router, RSC + "use client")           │
│  - UI, animaciones (Framer Motion), suscripción Realtime    │
│  - NUNCA conoce correct_index ni decide resultados          │
└───────────────┬─────────────────────────────────────────────┘
                │ Server Actions / Route Handlers (auth, lecturas)
                │ Llamadas RPC / invoke Edge Function (acciones de juego)
┌───────────────▼─────────────────────────────────────────────┐
│  Supabase Edge Functions  +  Postgres RPC (lógica AUTORITATIVA)│
│  - select_option, resolve_penalty, start_tournament, tick... │
│  - importan el MOTOR (TS puro) y lo aplican con now() server │
└───────────────┬─────────────────────────────────────────────┘
                │
┌───────────────▼───────────────┐   ┌─────────────────────────┐
│  Postgres (estado + RLS)       │   │  Realtime               │
│  - tablas del juego/torneo     │◄──┤  Broadcast (server→cli) │
│  - pg_cron → tick() backstop   │   │  Presence (lobby)       │
└────────────────────────────────┘   └─────────────────────────┘
```

### 1.2 El motor es TS puro y compartido

El **motor de partido** (resolución de penales §5.2) y el **motor de torneo** (grupos,
mejores terceros, bracket, muerte súbita) viven como **funciones puras sin I/O** en
`lib/engine/` (o `packages/engine`). Reglas:

- Entrada: estado + inputs (respuestas, timestamps, semillas aleatorias inyectadas).
- Salida: nuevo estado / decisión. **Determinista**: la aleatoriedad entra como parámetro
  (seed), nunca `Math.random()` interno → testeable y reproducible.
- Se testea con Vitest sin tocar la red ni la DB (F3 y F6).
- Las Edge Functions son una capa fina: leen estado de Postgres, llaman al motor con
  `now()` del servidor, persisten el resultado y emiten Broadcast.

### 1.3 Timing autoritativo (decisión cerrada)

**Event-driven + lazy resolution + cron backstop.** No hay loops largos (Vercel es
serverless). Cada penal abierto tiene `started_at` y `deadline = started_at + 10s`
fijados por el servidor.

**El penal SIEMPRE se resuelve recién al cumplirse los 10s** (no antes, aunque ambos ya
hayan elegido). Durante la ventana, cada jugador puede **cambiar su elección las veces que
quiera** con `select_option`; el server registra la **última** selección y su
`selected_at` (timestamp server). Recién al vencer el `deadline` se "patea": la respuesta
que vale es la última seleccionada, y la **rapidez** que decide GOL/ATAJA en caso de
ambos-bien es el `selected_at` de esa última selección. Esto mantiene a los dos jugadores
sincronizados (los dos ven la barra completa) y evita revelar el resultado antes.

La resolución es **idempotente** y se dispara por cualquiera de:

1. **Poke del cliente** — cuando el countdown local llega a 0, el cliente llama
   `resolve_penalty`. El servidor valida contra **su** `deadline` (no contra el reloj del
   cliente) → no se puede trampear adelantando/atrasando el reloj local.
2. **`tick()` por `pg_cron`** (cada pocos segundos) — red de seguridad: barre penales
   con `now() > deadline` aún abiertos (todos los clientes desconectados), materializa
   `bot_intents` vencidos, y cierra rooms cuyo `starts_at` ya pasó.

`resolve_penalty(penalty_id)` toma lock optimista (status `open → resolving` con
`UPDATE ... WHERE status='open'`); si no actualiza filas, otro proceso ya resolvió →
no-op. Garantiza exactly-once aunque lleguen los triggers a la vez.

**Sincronización de reloj cliente/servidor:** el cliente estima su offset contra `now()`
del servidor (lo recibe en `penal:start`) y dibuja la barra de 10s contra el `deadline`
server, no contra su reloj local. Así la barra es fiel aunque haya skew, y el *poke* a 0
coincide con el `deadline` real. El server igual valida (anti-trampa).

Tras resolver, la animación GOL/ATAJADO tiene **duración fija (≤5s)** y al terminar se
abre automáticamente el siguiente penal (ritmo constante, ver §3.3).

### 1.4 Bot-vs-bot: simulación instantánea (decisión cerrada)

Un partido sin ningún humano (`is_bot_only = true`) NO corre el flujo temporizado: se
resuelve al instante con `simulate_bot_match` usando el modelo probabilístico por
dificultad (§7.2 del BRIEF) y se persiste score + log penal-a-penal. Solo los partidos
con ≥1 humano usan el motor realtime de 10s. Así un humano nunca espera a que 23 partidos
bot-vs-bot se jueguen "de verdad".

### 1.5 Realtime: Broadcast + Presence (decisión cerrada)

- **Broadcast autoría server**: los eventos de juego se emiten desde Edge Functions /
  triggers, con payload **controlado** (jamás incluye `correct_index`).
- **Presence**: lista de conectados del lobby en vivo.
- El cliente se suscribe; nunca lee tablas sensibles por Postgres Changes.

---

## 2. Modelo de datos (Postgres) + RLS

Todas las tablas tienen RLS habilitada. `correct_index` **nunca** se expone al cliente
(ni por SELECT ni por Broadcast). Las escrituras de juego pasan **solo** por RPC/Edge
con `SECURITY DEFINER` que validan.

### 2.1 Tablas

| Tabla | Campos clave | Notas |
|---|---|---|
| `profiles` | `id uuid PK = auth.uid`, `username citext UNIQUE`, `avatar jsonb`, `created_at` | username es el nombre en juego |
| `nations` | `id`, `name`, `code`, `fifa_rank int`, `accent_color`, `flag_asset`, `difficulty_tier` (`elite\|high\|medium\|low`) | seed estático (clasificados 2026) |
| `questions` | `id`, `category`, `difficulty` (`easy\|medium\|hard\|very_hard`), `prompt`, `options jsonb` (3), `correct_index int` (0-2), `explanation` | `correct_index` **server-only** |
| `rooms` | `id`, `code text UNIQUE`, `host_id`, `status` (`lobby\|starting\|in_progress\|finished\|cancelled`), `starts_at`, `created_at` | `starts_at` = arranque (lobby +2 min); `cancelled` si quedó sin humanos |
| `tournaments` | `id`, `room_id`, `status` (ver §4), `current_phase`, `seed`, `champion_participant_id`, `third_place_participant_id` | 1:1 con room; `seed` gobierna sorteos/bracket/bot_intents → reproducible y testeable |
| `participants` | `id`, `tournament_id`, `user_id?` (null = bot), `nation_id`, `is_bot`, `group_letter`, `seed`, `eliminated_phase?`, `placement?` | 48 por torneo; `placement`/`eliminated_phase` para historial |
| `matches` | `id`, `tournament_id`, `phase`, `bracket_slot`, `home_participant_id`, `away_participant_id`, `home_score`, `away_score`, `winner_participant_id`, `status` (ver §3), `is_bot_only` | |
| `penalties` | `id`, `match_id`, `idx` (1..5 o súbita), `kicker_participant_id`, `keeper_participant_id`, `question_id`, `difficulty`, `started_at`, `deadline`, `status` (ver §3), `second_chance bool`, `removed_option int?`, `resolution jsonb` | timestamps server |
| `penalty_answers` | `penalty_id`, `participant_id`, `option_index`, `selected_at` (server, última selección), `is_correct`, `is_random` (elegida por ausencia), `phase` (`first\|second_chance`) | una fila por (penalty, participant, phase); `option_index`/`selected_at` se actualizan en cada cambio |
| `bot_intents` | `penalty_id`, `participant_id`, `phase` (`first\|second_chance`), `scheduled_answer_at`, `will_be_correct`, `chosen_option`, `materialized bool` | precomputado al abrir cada penal **y** al entrar en segunda chance / muerte súbita |
| `tournament_questions` | `tournament_id`, `question_id` | PK compuesta → no-repeat intra-torneo |

### 2.2 RLS (resumen de políticas)

- `profiles`: SELECT propio + de co-participantes; UPDATE solo propio.
- `nations`, `questions`: `questions` **sin** SELECT de `correct_index` para `authenticated`
  (se sirve por vista/columnas o se omite; lectura completa solo `service_role`). `nations`
  SELECT abierto a `authenticated`.
- `rooms`, `participants`, `matches`: SELECT acotado a miembros del torneo correspondiente.
- `penalties`: SELECT acotado a participantes del match, **excluyendo** datos de la
  respuesta correcta hasta que `status` ∈ {`resolved`}; se sirve la pregunta + opciones por
  Broadcast, no por tabla.
- `penalty_answers`, `bot_intents`: sin SELECT directo del cliente; escritura solo por RPC.
- Toda escritura de juego: vía RPC `SECURITY DEFINER` que revalida pertenencia y ventana.

---

## 3. Máquinas de estado del partido y del penal

### 3.1 Penal

```
pending ──open──▶ open ──(resolución)──▶ resolved   (GOL | ATAJADO)
                   │
                   └─ caso "los dos mal" ─▶ second_chance ─▶ resolved
```

- `open`: server fija `started_at`, `deadline = +10s`, precomputa `bot_intents` de bots
  involucrados, emite Broadcast `penal:start` (pregunta + 3 opciones, **sin** correcta).
  Durante la ventana cada humano puede cambiar su elección (`select_option`); se guarda la
  última con su `selected_at`. Las elecciones de cada uno **no** se transmiten al rival
  hasta resolver.
- Para un participante **ausente** (desconectado / pestaña oculta) sin selección, al
  resolver el server le asigna una **opción aleatoria de las 3** (seed determinista) — no
  se lo penaliza con fallo seguro (ver §5.2). Un humano **presente** que no elige nada =
  timeout (cuenta como fallo, "la tiró afuera").
- Resolución (función pura `resolvePenalty`), inputs por jugador: `{answered, option,
  selected_at, is_correct}`; aplica tabla §5.2 del BRIEF:
  1. Ambos correctos → gana el más rápido (`selected_at` menor). GOL si gana el pateador,
     ATAJADO si gana el arquero.
  2. Uno correcto y el otro mal/timeout → gana el correcto.
  3. Mismo `selected_at` exacto y ambos correctos → desempate **aleatorio** (seed server).
  4. **Los dos mal** → `second_chance`: se quita la opción que ambos erraron
     (`removed_option`), quedan 2 opciones y **5s** nuevos. **Ambos jugadores vuelven a
     responder** y se aplica de nuevo la **misma tabla §5.2** (ambos bien → mete el más
     rápido; uno bien → ese gana; mismo tiempo y ambos bien → aleatorio), con una sola
     diferencia: ya **no hay tercera chance**. Si en la segunda chance vuelven a errar los
     dos (o el pateador no responde) → **gana el arquero (ATAJA)** porque el pateador "la
     tiró afuera".
- `resolved`: persiste `resolution` (scorer, outcome, **reason** para animación, variante,
  tiempos) y emite `penal:result`. El `reason` mapea el porqué a la familia de animación
  (§8.1): `goal` (gol), `save` (atajada del arquero) o `miss_wide` (afuera del arco por
  error del pateador).

### 3.2 Partido (match)

```
pending ──▶ in_progress (penal 1..5, kicker/keeper alternan) ──▶
   ├─ grupos:        finished  (reparte 3 / 1 / 0 pts según resultado)
   └─ eliminación:   empate en goles ─▶ sudden_death ─▶ finished (1 avanza)
```

- Alternancia: penal impar J1 patea / J2 ataja; penal par invertido (como Mundial real).
- **Grupos**: la tanda de 5 **puede terminar empatada**. NO hay muerte súbita en grupos.
  Se reparten puntos como partido real: **victoria = 3, empate = 1, derrota = 0** (esto
  reemplaza la línea literal de §6.1 BRIEF "no hay empate" — aclaración del owner). Se
  persisten goles a favor/en contra para la diferencia de goles usada en desempates.
- **Eliminación directa**: si tras 5 penales hay empate de goles → `sudden_death`: rondas
  extra (un penal por lado, alternando) hasta que en la misma ronda uno meta y el otro no.
  Solo acá se sigue pateando. Dificultad de la pregunta sigue la de la fase.
- `is_bot_only` → se resuelve por `simulate_bot_match` (instantáneo) en vez del flujo open.

### 3.3 Reloj de ronda y sincronización entre humanos

Para que **varios humanos** en distintos partidos de la misma ronda estén siempre
sincronizados, cada **ronda** avanza con un **barrier por penal-index** (no un reloj
rígido). Una "ronda" es una **jornada de grupos** o una **fase de eliminación**.

- El penal `k` (misma pregunta compartida, §4.1) abre a la vez en **todos** los partidos
  con humanos: 10s de respuesta + animación de duración fija.
- **Barrier:** el penal `k+1` se abre recién cuando **todos** los partidos de la ronda
  cerraron el penal `k`. Esto es necesario porque el caso **"los dos mal"** agrega una
  **segunda chance de 5s** a ese partido puntual (pasa en cualquier fase, también en
  grupos): el resto de la sala **lo espera** antes de pasar a la siguiente pregunta.
- **Tiempo muerto del barrier:** los partidos que ya cerraron el penal `k` muestran
  mientras tanto cómo **van quedando los grupos** (posiciones en vivo) y el **estado de
  los penales** que todavía se están resolviendo (p. ej. "Grupo C: en segunda chance").
- El barrier está acotado (~5-7s extra como mucho, lo que dura una segunda chance).
- Los partidos `is_bot_only` se **simulan al instante** al iniciar la ronda; su resultado
  se **revela** al ritmo del barrier (no hace esperar a nadie).
- **Grupos:** 3 jornadas consecutivas (cada humano juega 1 partido por jornada). Entre
  jornadas, una vista de bracket/posiciones breve (≈4s). El jugador **nunca queda ocioso**
  dentro de grupos; el único punto de sincronización duro es el cierre de grupos para
  armar el bracket de 32.
- **Eliminación directa:** **gate por fase** — todos los partidos de una fase (incluida la
  muerte súbita, que puede extender el tiempo) deben terminar antes de pasar a la
  siguiente (p. ej. todos los octavos → cuartos). Los humanos que ya terminaron su partido
  **miran el bracket en vivo**: qué partidos siguen y cómo va el marcador de penales.
- Caso raro (2 humanos en el **mismo grupo** que se cruzan): el reloj compartido ya los
  pone en la misma jornada; si uno está ausente, juega con respuestas aleatorias (§5.2).

---

## 4. Máquina de estado del torneo

```
groups ──▶ (standings) ──▶ round_of_32 ──▶ round_of_16 ──▶ quarters
        ──▶ semis ──▶ (third_place + final) ──▶ finished(champion)
```

- **Grupos**: 48 participantes, 12 grupos de 4, todos contra todos (round-robin = **6
  partidos por grupo**, **72 totales**). Empate posible (1 pt c/u). Partidos de
  **distintos grupos en simultáneo**. Bot-only instantáneos; humanos en realtime.
- **Reparto de humanos:** los jugadores reales se distribuyen **equitativamente, uno por
  grupo** (round-robin: 1º humano → grupo A, 2º → B, … 13º → A de nuevo). Nunca se amontona;
  con ≤12 humanos cada uno cae en un grupo distinto → no se cruzan en fase de grupos y cada
  grupo tiene al menos un humano hasta agotarlos. El resto de cupos se rellena con bots.
- **Clasificación**: 1º y 2º de cada grupo (24) + **8 mejores terceros** = 32.
- **Desempates (orden estilo FIFA, sin tarjetas/fair-play):**
  - *Dentro del grupo:* puntos → diferencia de goles → goles a favor → (entre los
    empatados) puntos head-to-head → dif. de goles h2h → goles a favor h2h → **sorteo
    determinista** (seed del torneo).
  - *Mejores terceros (entre grupos):* puntos → diferencia de goles → goles a favor →
    **sorteo determinista** (no hay head-to-head entre grupos distintos).
  - El **sorteo** es el último recurso (equivale al "drawing of lots" de FIFA): aleatorio
    pero por `seed` guardado → reproducible y testeable. Nunca se juega un partido de
    desempate (no hace esperar al resto).
- **Mapeo de terceros al bracket:** los 8 terceros se asignan a slots de `round_of_32`
  según una tabla determinista por combinación de grupos clasificados (al estilo del
  esquema oficial 2026), evitando que dos del mismo grupo se crucen de entrada.
- **Nombres de fase** (resolviendo la nota del BRIEF §6): con 32 a partido único →
  `round_of_32` (dieciseisavos) → `round_of_16` (octavos) → `quarters` → `semis` →
  `third_place` + `final`.
- Avance **event-driven** con gate por fase (§3.3): cuando todos los partidos de la fase
  están `finished`, `advance_tournament` arma la siguiente. El bracket se emite por
  Broadcast con marcadores en vivo.

### 4.1 Asignación de preguntas

- **Una pregunta por (ronda, penal-index)**, compartida por **todos** los partidos con
  humanos de esa ronda: en una jornada/fase todos ven la **misma pregunta al mismo tiempo**
  (extiende la regla del BRIEF §5.1 a la ronda; máxima sincronía y mínimo consumo).
- Los partidos `is_bot_only` se **simulan** y **no consumen** preguntas del banco (no hay
  UI que mostrar; el resultado sale del modelo probabilístico).
- Dificultad por fase según §9.3 BRIEF. **Sin repetición intra-torneo** vía
  `tournament_questions`. Consumo típico por torneo ≈ 45 preguntas → 200+ sobra.
- Lista de **48 naciones** (clasificados 2026) + `fifa_rank` para dificultad de bots: dato
  semilla a definir en F5/F7 (`nations`).

---

## 5. Contratos de RPC / Edge Functions

Todas autoritativas, validan pertenencia y usan `now()` del servidor. Errores como
`{ error: code }` con códigos explícitos.

| Función | Input | Efecto / Output | Errores |
|---|---|---|---|
| `create_room()` | — | crea room `lobby`, `starts_at=now()+2min`, devuelve `code` | `unauthenticated` |
| `join_room(code)` | code | agrega al caller como participante humano si hay cupo y `lobby`; si con él se llega a **48 → arranca ya** (`start_tournament`, sin esperar los 2 min) | `room_not_found`, `room_full`, `already_started`, `room_cancelled` |
| `quick_play()` | — | si el caller ya tiene torneo activo → lo **reanuda** (`get_active_match`). Si no, matchmaking: une a la sala en `lobby` que **más humanos** tenga con cupo; si no hay, crea una. Atómico (evita carreras) | `unauthenticated` |
| `get_active_match()` | — | devuelve el torneo/partido/penal en curso del caller (para rehidratar tras refresh) o `null` | |
| `start_tournament(room_id)` | room_id | rellena bots hasta 48, asigna naciones aleatorias, **reparte humanos uno por grupo** (round-robin) y completa con bots, arma 12 grupos + fixture, estado `in_progress`; simula bot-only de la 1ª jornada. Si 0 humanos → `cancelled` | `already_started` |
| `select_option(penalty_id, option_index)` | ids | registra/actualiza la **última** selección con `selected_at=now()` server; valida ventana `[started_at, deadline]` y pertenencia. **No** resuelve (la resolución es a los 10s) | `out_of_window`, `not_participant`, `penalty_closed` |
| `resolve_penalty(penalty_id)` | id | idempotente, **solo** si `now()≥deadline`: asigna aleatoria a ausentes, materializa bot_intents, aplica motor, persiste, emite `penal:result`, agenda siguiente penal o cierra match | `too_early` / no-op si ya resuelto |
| `advance_match(match_id)` | id | reparte puntos (grupos) o define ganador/súbita (elim.); dispara `advance_tournament` si corresponde | |
| `advance_tournament(tournament_id)` | id | arma siguiente fase cuando la actual terminó; simula bot-only; emite bracket | |
| `simulate_bot_match(match_id)` | id | resuelve match bot-vs-bot al instante (modelo probabilístico), persiste log | |
| `abandon(tournament_id)` | id | el caller deja el torneo: su participante pasa a `is_bot=true` (dificultad de su nación); penales en curso suyos se resuelven por `bot_intents`; devuelve OK para volver al home | `not_participant` |
| `tick()` (pg_cron) | — | backstop: penales vencidos, bot_intents vencidos, rooms con `starts_at<now` en lobby → `start_tournament` | |

### 5.1 Abandono → conversión a bot

Cualquier jugador puede tocar **"Abandonar"** en cualquier momento (lobby, pre-partido,
durante un penal o entre partidos). Efecto de `abandon(tournament_id)`:

- Su `participant` pasa a `is_bot = true`, conservando su **nación** y, por lo tanto, su
  **dificultad** (ranking FIFA, §7.2 BRIEF).
- Cualquier penal `open` donde participaba se resuelve de ahí en más por `bot_intents`
  (su respuesta la decide el bot, no queda colgado el partido).
- El **torneo continúa** normalmente; el bot juega el resto.
- El usuario vuelve al **menú principal**. No puede re-reclamar ese cupo en v1.

### 5.2 Desconexión / ausencia (≠ abandono)

Si un humano se desconecta, refresca o pasa la pestaña a segundo plano **sin** tocar
"Abandonar":

- El **juego sigue corriendo** al ritmo del reloj de ronda (§3.3); no se pausa nada para
  no afectar a los demás.
- En cada penal mientras está ausente, el server le asigna una **respuesta aleatoria de
  las 3** (seed determinista, marcada `is_random`). No se lo convierte en bot.
- Al **reconectar**, `get_active_match()` rehidrata su estado (torneo/partido/penal con su
  `deadline`) y retoma el control. Esto es lo que distingue desconexión (temporal,
  aleatorio) de **abandono** (definitivo, pasa a bot con dificultad de su nación).
- **No existe** auto-abandono por inactividad: un ausente juega con aleatorias hasta que
  vuelva o hasta que el torneo termine.

---

## 6. Canales Realtime

| Canal | Mecanismo | Eventos |
|---|---|---|
| `room:{code}` | Presence + Broadcast | presence (conectados), `room:status`, `room:countdown` |
| `match:{id}` | Broadcast | `penal:start` (pregunta+opciones, sin correcta), `penal:result` (GOL/ATAJADO+tiempos), `match:result` (marcador) |
| `tournament:{id}` | Broadcast | `bracket:update` (fases, cruces, puntos), `score:live` (marcador de penales en vivo de partidos en curso) y `standings:live` (posiciones de grupos en vivo, para el tiempo muerto del barrier §3.3) |

---

## 7. Anti-trampa y seguridad

- Timing y evaluación **solo server**; el cliente nunca recibe `correct_index` antes de
  `resolved`. Las elecciones del rival tampoco viajan hasta resolver.
- `select_option` valida: dentro de `[started_at, deadline]`, el caller es participante del
  match, penal `open`. Se puede llamar varias veces (cambio de respuesta); solo cuenta la
  última y su `selected_at` lo pone el server.
- La resolución solo ocurre con `now() ≥ deadline` (ni el poke ni nada la adelantan).
- **RLS en todas las tablas**; columnas sensibles fuera del alcance de `authenticated`.
- Sin secretos en el cliente (solo `NEXT_PUBLIC_SUPABASE_URL` y anon key; `service_role`
  solo en Edge/CI).

---

## 8. Flujos de UX y entrada al juego

- **Menú principal — botón "Jugar" (quick-play):** entra automáticamente a la sala en
  `lobby` con más gente y cupo; si no hay ninguna, crea una. Resuelve por `quick_play()`
  (atómico, sin carreras). El botón es además el **gesto de usuario** que desbloquea el
  audio (políticas de autoplay del navegador).
- **Crear / unirse por código** sigue disponible (compartir link). En mobile, el compartir
  usa **Web Share API**; fallback a copiar código.
- **Fin de partido (ganás o perdés):** pantalla de **resumen de tu partida** (marcador,
  detalle penal a penal con tiempos, tu nación y la rival) + dos acciones: **"Jugar de
  nuevo"** (misma función que "Jugar") y **"Volver al inicio"**. Si fuiste eliminado, podés
  además seguir mirando el bracket en vivo hasta que se corone el campeón.
- **Perfil → pestaña "Historial":** lista de torneos jugados con la **selección que te
  tocó**, la **fase en la que quedaste eliminado** (o campeón / 3er puesto) y un **resumen
  breve** de la partida. Datos derivados de `participants` (`placement`/`eliminated_phase`)
  + `matches`/`penalties`.
- **Perfil → estadísticas agregadas:** títulos ganados, % de victorias, goles totales,
  mejor posición y torneos jugados (sensación de progreso, sin ranking global — eso sigue
  fuera de v1). Se calculan de los mismos datos (vista/consulta agregada).
- **Audio (obligatorio, solo SFX):** efectos de silbato, multitud, gol, atajada y
  heartbeat de tensión en los últimos 3s; música/ambiente. **Sin relato/locución** (ni voz
  ni texto de comentario). Respeta `prefers-reduced-motion` para vibración/animación y
  ofrece **mute** (persistente). Se desbloquea con el primer gesto (botón Jugar).
- **Responsive total:** el juego se juega igual en **mobile y desktop**. Mobile-first pero
  con layouts adaptados a pantalla grande (no solo "móvil estirado"); la pantalla de penal,
  el bracket y los resúmenes funcionan en ambos.

### 8.1 Quality-of-life (cerradas como default)

- **HUD durante la tanda:** marcador en vivo (ej. 2–1), "Penal N de 5" y si en este
  **pateás o atajás**; resaltado de tu opción elegida (cambiable).
- **Animaciones de penal según la causa (no un clip único):** el `reason` de la resolución
  (§3.1) elige la familia, y dentro de cada una hay **varias variantes + colocación
  aleatoria** (izq/centro/der, alto/bajo, por `seed`) para que no patee siempre al mismo
  lugar:
  - `goal` → el pateador convierte (arquero vencido / fue para el otro lado); varias
    colocaciones del remate.
  - `save` → cuando el arquero gana el duelo (ambos aciertan pero el arquero responde más
    rápido): **atajada épica** (volada, manotazo, achique).
  - `miss_wide` → cuando el pateador erra la pregunta (o falla la segunda chance): la
    pelota se va **afuera del arco / por arriba**, directamente; no es mérito del arquero.
- **Revelar la correcta al resolver:** en la pantalla GOL/ATAJADO se muestra la opción
  correcta y el `explanation` de la pregunta (usa el campo del banco; educativo).
- **"Sos vos" en el bracket/grupos:** resaltar tu nación y tu grupo para ubicarte rápido
  entre 48 equipos.
- **Avatar:** default sensato si no se personaliza; **preview en vivo** al editar; editable
  después desde Perfil.
- **Cuenta sin email:** aviso suave en Perfil ("agregá un email para no perder la cuenta",
  ya que sin email no hay recuperación).
- **Links de sala inválidos** (ya empezada / llena / cancelada / inexistente): mensaje
  claro + ofrecer "Jugar" (quick-play) como salida.
- **Persistencia de preferencias** (mute, `prefers-reduced-motion`) en `localStorage`.
- **Teclado en desktop:** responder con 1/2/3; foco accesible.
- **Momento campeón:** pantalla celebratoria (trofeo/confeti original) al coronar.
- **Estados de carga/empty/error** en cada vista (se endurecen en F9).
- **Disclaimer** discreto "no afiliado a FIFA" (assets originales).

### 8.2 Render 3D (solo avatar + penal)

El 3D se usa **únicamente** en dos lugares; todo el resto de la app (lobby, bracket,
menús, preguntas/respuestas, resultados) es **2D**. El avatar **no** se muestra en el
lobby ni en resultados, solo donde hay 3D.

- **Tecnología:** React Three Fiber + drei sobre Three.js. El 3D se **code-splittea**
  (import dinámico) y se carga **solo** en la ruta del creador y en la escena de penal,
  para que el resto de la app quede liviana. Estética **minimal low-poly** (corre bien en
  mobile de gama media).
- **Assets (CC0):** Quaternius — *Universal Base Characters* (cuerpos base hombre/mujer,
  rig humanoide), *Modular Character Outfits* (62 partes modulares: cabeza/pelo, torso,
  piernas, pies) y *Universal Animation Library* (compatible Mixamo). Variedad por
  **malla intercambiable + tintado de color**. Formato glTF/GLB.
- **Creador de avatar:** personaje 3D a la izquierda, **rotable arrastrando**
  (OrbitControls, solo yaw); a la derecha 4 selectores verticales (cabeza/pelo, remera,
  pantalón, zapatos) + toggle de cuerpo base (♂/♀). Default sensato, preview en vivo. Se
  guarda en `profiles.avatar` (jsonb): `{ bodyType, head, hair{part,color}, top{part,
  color}, bottom{part,color}, shoes{part,color} }`.
- **Escena de penal (3D):** cancha + arco + pelota + **dos personajes = los avatares de
  los jugadores** (pateador y arquero), **tal cual los armó cada jugador** (sin tintar por
  nación; ver §8.3 #1). La identidad de selección se lee solo en HUD/bandera (pre-partido,
  marcador, bracket), no en la ropa del muñeco. La tarjeta de pregunta y la UI siguen
  siendo **2D superpuestas**; durante los 10s la escena va **atenuada/desenfocada** detrás
  de la tarjeta, y al resolver se oculta la tarjeta y se juega la animación según el
  `reason` (§8.1): `goal` (con colocación variable), `save` (estirada) o `miss_wide`
  (afuera).
- **Animaciones de personaje:** idle + patada + estirada + festejo, vía Universal
  Animation Library / Mixamo retargeteadas al rig humanoide. **Riesgo principal** (ver
  §8.3): si el retargeting de animaciones específicas (penal/arquero) resulta costoso,
  fallback a **animación procedural** (trayectoria de pelota tweenada + movimiento simple
  de los modelos), coherente con el estilo minimal.

### 8.3 Cabos abiertos del 3D

1. **Kit vs avatar en el penal — RESUELTO:** el pateador/arquero usan el **outfit del
   avatar tal cual lo armó el jugador**, sin tintar por nación. La identidad de selección
   se muestra solo en HUD/bandera (pre-partido, marcador, bracket), no en la ropa. El
   schema de `profiles.avatar` no lleva color de nación.
2. **Animación (riesgo de esfuerzo):** conseguir patada de penal + estirada de arquero
   prolijas es el mayor laburo/riesgo 3D. Plan: arrancar con clips de Mixamo
   retargeteados; si se complica, fallback procedural. Validar al inicio de la integración.
3. **Variedad real de piezas:** el mapeo exacto de las 62 partes a "~6 pelos / ~8 remeras
   / ~4 pantalones / ~4 zapatos" se cierra cuando tenga el pack cargado (malla vs color).

---

## 9. Fuera de alcance (v1)

Chat, ranking/ELO persistente, monetización, app nativa, modos alternativos, edición
libre de avatar, i18n a otros idiomas. Dejar el código preparado (estructura, tipos) pero
no implementar.

---

## 10. Criterio de verificación end-to-end (§12 BRIEF)

1. Registro (username+pass), armado de avatar, entrada al home. → F2
2. Crear sala, compartir link, otro humano se une; a los 2 min se llena con bots y arranca
   torneo de 48. → F4/F5
3. Tanda completa con timing del server, animaciones GOL/ATAJADO y los 6 casos §5.2
   (incl. "los dos mal"). → F3/F4/F8
4. Torneo avanza por todas las fases (grupos con puntos + mejores terceros, elim. con
   muerte súbita) hasta campeón y 3er/4to. → F6
5. Varias salas/torneos en simultáneo sin interferencia. → F4/F9
6. `typecheck`, `lint`, `build` y tests del motor de juego y de torneo en verde. → todas
