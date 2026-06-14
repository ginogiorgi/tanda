# PLAN — TANDA ⚽

> Fases verticales en orden. Cada fase es una rebanada que funciona y se verifica sola.
> El detalle de tareas atómicas reanudables vive en `TODO.md`. La arquitectura está en
> `SPEC.md`. El producto en `docs/BRIEF.md`.

Regla: una fase no se cierra sin `typecheck`, `lint`, `build` (y los tests que apliquen)
en verde, con evidencia real del output, y un commit descriptivo.

---

## F1 · Scaffold

Next.js (App Router) + TS estricto + Tailwind, cliente Supabase (browser/server),
estructura de carpetas (`app/`, `lib/`, `lib/engine/`, `supabase/`), design tokens de la
paleta Mundial 2026 (§4 BRIEF: negro/blanco/dorado + acentos vibrantes) como CSS vars /
Tailwind theme, fuente geométrica sans libre, `.env.example`, ESLint + tsconfig estricto,
CI (typecheck/lint/build/test) en GitHub Actions, y un deploy "hello world" a Vercel.

**Definición de terminado:** `pnpm typecheck && pnpm lint && pnpm build` verdes; CI verde;
URL de Vercel viva mostrando una landing mínima con los tokens aplicados.

---

## F2 · Auth + Avatar + Perfil

Signup/login con **username + contraseña** (email sintético `username@users.tanda2026.com.ar`;
tabla `profiles` con `username` único). Creador de **avatar 3D** (React Three Fiber +
**primitivas low-poly propias**, sin GLBs externos): personaje rotable arrastrando + 4
selectores (cabeza/pelo, remera, pantalón, zapatos) + 2 cuerpos base (♂/♀); guardado como
JSON en `profiles.avatar`. El 3D va **code-splitteado** (solo en el creador). Pantalla de
Perfil con **email real opcional** (`auth.updateUser`) para habilitar recuperación. Ver
SPEC §8.2.

La pantalla de Perfil incluye la pestaña **Historial** (selección que tocó, fase de
eliminación / título, resumen breve) y **stats agregadas** (títulos, win %, goles, mejor
posición, torneos jugados) — derivadas de datos de torneos jugados.

**Definición de terminado:** un usuario se registra, arma avatar, cierra sesión, vuelve a
loguearse y ve su avatar; puede cargar email opcional y ver su historial. Migraciones +
RLS de `profiles`.

---

## F3 · Motor de partido (TS puro) + datos + tests

Modelo de datos del juego (migraciones de §2 SPEC) + máquina de estados de la **tanda de
5** con timing autoritativo. Motor `lib/engine/penalty.ts` y `match.ts` como **funciones
puras deterministas** (aleatoriedad por seed). Cubre los **6 casos de §5.2** (incl. "los
dos mal" con segunda chance de 5s y 2 opciones) y **muerte súbita**.

**Definición de terminado:** suite Vitest del motor en verde cubriendo cada fila de §5.2,
segunda chance, muerte súbita y alternancia kicker/keeper.

---

## F4 · Realtime (motor en vivo)

Salas (`create_room`/`join_room`/`quick_play`), lobby con **Presence**, countdown de
**2 min**, misma pregunta **simultánea** (Broadcast `penal:start`), `select_option`
(respuesta **cambiable**, se manda/computa recién a los 10s) con timestamp server,
`resolve_penalty` idempotente (a los 10s; aleatoria a ausentes), **reloj de ronda con
barrier por penal** (§3.3: la sala espera a la segunda chance de "los dos mal" antes de la
siguiente pregunta; tiempo muerto muestra posiciones en vivo), `tick()` por `pg_cron` como
backstop, animación GOL/ATAJADO de duración fija (≤5s).
Incluye **reconexión** (`get_active_match` rehidrata tras refresh) y **cancelar sala** sin
humanos.

**Definición de terminado:** dos clientes en una sala juegan un penal sincronizado real;
se puede cambiar la respuesta hasta los 10s; el resultado lo decide el server a los 10s; un
cliente que refresca retoma; un penal sin nadie se cierra por backstop.

---

## F5 · Bots (server-side)

Bots que rellenan cupos al arrancar, con dificultad por **selección/ranking FIFA** (§7.2:
élite/alto/medio/bajo → % acierto y rango de velocidad). `bot_intents` precomputados al
abrir cada penal y materializados en la resolución. Corren **del lado servidor**.

Incluye el **botón Abandonar** (`abandon`): en cualquier momento el participante pasa a
bot (con la dificultad de su nación) y el usuario vuelve al home; el torneo sigue.

**Definición de terminado:** una sala con 1 humano se completa a 48 con bots, se asignan
naciones aleatorias y se juega un partido humano-vs-bot con tiempos realistas; abandonar
convierte al jugador en bot sin colgar el partido.

---

## F6 · Motor de torneo + tests

`lib/engine/tournament.ts` puro: 48 participantes, 12 grupos, fixture todos-contra-todos,
puntos (3/1/0, empate posible), clasificación (2 por grupo + **8 mejores terceros**) con
**desempates estilo FIFA** (puntos → dif → GF → h2h → sorteo por seed), **mapeo
determinista de terceros** al bracket, `round_of_32 → … → final` + `third_place`, muerte
súbita. Bot-vs-bot por `simulate_bot_match` instantáneo. Avance event-driven con **gate por
fase** + **marcadores en vivo** en el bracket (`score:live`).

**Definición de terminado:** tests Vitest del torneo en verde (grupos, mejores terceros,
desempates incl. sorteo determinista, mapeo de terceros, bracket completo); un torneo
simulado avanza hasta campeón y 3er/4to puesto.

---

## F7 · Banco de preguntas

**200+ preguntas** exclusivamente de Mundiales, factualmente correctas, clasificadas por
dificultad (`easy/medium/hard/very_hard`) y categoría, con `seed` script. Asignación por
fase (§9.3) y **sin repetición intra-torneo** (`tournament_questions`).

**Definición de terminado:** el seed corre, carga 200+ preguntas; un torneo completo
asigna preguntas por dificultad de fase sin repetir ninguna.

---

## F8 · UI / animaciones premium

Pantalla de **penal** con **escena 3D** (R3F): cancha + arco + pelota + los **avatares**
de pateador y arquero. Tarjeta de pregunta + 3 opciones **2D centrada** (respuesta
cambiable hasta el final) con la escena 3D atenuada/desenfocada detrás; al resolver se
oculta la tarjeta y se juega la animación **procedural según la causa** (`goal` con
colocación variable / `save` estirada / `miss_wide` afuera). **Barra de tiempo** (10s) roja + vibración
al final. El 3D va code-splitteado (solo acá y en el creador). Ver SPEC §8.2.
**Bracket** estilo mundial con marcadores en vivo, **pre-partido** (país+bandera vs
país+bandera), **resumen de fin de partido** (marcador + detalle penal a penal + naciones
+ "Jugar de nuevo" / "Volver al inicio"). Menú con botón **"Jugar"** (quick-play). **Audio
obligatorio** (silbato/multitud/gol/atajada + mute). **Responsive total** (mobile y desktop,
no solo mobile-first). Paleta Mundial 2026. **Sin onboarding** (juego simple).

**Definición de terminado:** flujo visual completo (menú → Jugar/lobby → bracket →
pre-partido → penal → resumen) pulido, fluido, con audio, en mobile **y** desktop.

---

## F9 · Pulido

Auditoría anti-trampa y **RLS** en todas las tablas, estados de **carga/empty/error** en
cada vista, accesibilidad (`prefers-reduced-motion`), performance de animaciones, manejo
de errores robusto, y **deploy final**.

**Definición de terminado:** los 6 criterios de §12 del BRIEF se cumplen en el entorno
deployado; varias salas/torneos corren en simultáneo sin interferirse.
