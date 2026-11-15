# Plan — Feedback 2 (F4 → deps → limpieza → J → G → H → K → F5/I)

> Escrito el 14/11/2026 (corrida solo de planificación: no hay código de la app en este commit).
> Fuentes: plan original `~/.claude/plans/gino-prob-tanda-en-greedy-snail.md` (F0–F5),
> pedido de Gino "borrá el muñeco viejo" (TODO.md, handoff punto 3) y feedback G–K
> (`gino-os/bot/pendiente-tanda.md`, sección "Feedback extra para tanda-plan").
> Criterio: **causa, no síntoma**. Cada punto dice dónde nace (archivo:línea), por qué no lo atrapó
> ninguna regla o test, y qué regla, test o fuente única evita que vuelva.

**Leyenda:**
- ✔ = verificado leyendo el código o con un comando.
- ⚠ = hipótesis que no pude verificar sin correr la app; se confirma con el test que la fase escribe ANTES del fix.

---

## 0. Resumen de fases (en orden de ejecución)

| # | Fase | Tamaño | Migración | Depende de | ¿Paralelizable? |
|---|---|---|---|---|---|
| P0 | **Cerrar F4** (deploy + smoke + TTFB) | S | — | — | — |
| P1 | **Deps**: `wip/fix-iat-dedupe` + `wip/deps-major` a main | S–M | grants (renumerada) | P0 | — |
| P2 | **Limpieza**: fuera `AvatarModel`, placeholder/error del GLB, T-pose, código muerto, compat SQL | M | `…_compat_cleanup` | P1 | El QA de I (P7a) puede arrancar en paralelo |
| P3 | **J**: tiempos de juego en una sola fuente; salas a 30 s | S | `…_game_timing` | P1 | Sí, con P2/P4 (otros archivos) |
| P4 | **G**: modelo de layout único, footer de vuelta, desktop | M | — | P2 (toca `PenalLive`) | — |
| P5 | **H**: máquina de estados del fin de partida/torneo + botones + tablero de penales | M | `…_ko_eliminated_at_finish` | P4 (mismas pantallas) | — |
| P6 | **K**: ayuda por modo + "Cómo jugar" | S–M | — | P4 (Button/Page) | Sí, con P5 |
| P7a | **I/F5a**: QA visual automático + fixes de assets (pelo, zapatos, materiales, paletas) | L | — | P2 | Sí, desde P2 |
| P7b | **F5b**: schema v2 + catálogo único + front que lee v1 y v2 | M | — | P7a | — |
| P7c | **F5c**: migración de avatares de prod a v2 (con backup) | S | `…_avatar_v2` | P7b en prod | — |
| P7d | **F5d**: creador nuevo (presets, pestañas, cámara, aleatorio) | L | — | P7c | — |

Total aproximado: 3 S, 5 M y 2 L.

**Regla de siempre en cada fase:**
1. Verde completo.
2. Rebase sobre `origin/main`.
3. Fast-forward a main y push (deploy de Vercel).
4. Migraciones por MCP más reconciliación del ledger y `get_advisors`.
5. Smoke en prod: público, más invitado → partida, con consola sin errores y 0 violaciones CSP.
6. Anotar el deploy en TODO.

Gino revisa solo en prod, así que prod nunca queda roto: si el smoke falla, se arregla o se revierte en el momento.

**Verde completo** = `pnpm typecheck · lint · knip · test · test:db · build · perf:budget · test:e2e`
(mobile y desktop, más los viewports nuevos de G) `· test:e2e:flow` (Supabase local aislado).

**Numeración de migraciones (decisión).** Se usa el próximo número libre al momento de mergear.
Un script nuevo `scripts/db/check-migrations.ts`, en CI, falla si:
- hay dos versiones iguales;
- una migración nueva tiene versión ≤ a la máxima que ya está en `origin/main`.

Hoy el choque `20261122000000` lo encontré a mano. Con esto lo atrapa CI. Reserva tentativa, a confirmar al mergear:

| Fase | Migración |
|---|---|
| P1 | `20261124000000_explicit_function_grants` (renumerada) |
| P2 | `20261124000001_compat_cleanup` |
| P3 | `20261124000002_game_timing` |
| P5 | `20261124000003_ko_eliminated_at_finish` |
| P7c | `20261124000004_avatar_v2` |

---

## P0 — Cerrar F4 (S)

**Estado (✔):**
- `c64849e` (F4), `0855d83` y `01c639e` (docs) están en `feat/feedback-1411` y pusheados.
- CI **verde** en los tres (runs 43644959994 / 43645277279 / 43646065935).
- PR #2 está en draft y MERGEABLE.
- F4 no tiene migraciones.

**Falta:**
1. `git fetch && git merge-base --is-ancestor origin/main HEAD` (✔ hoy contiene `6a333e8`), y después `git push origin HEAD:main` (fast-forward).
2. Esperar el deploy: `x-vercel-id` con `gru1` y el build nuevo (hash del chunk de `/` distinto).
3. Smoke en prod:
   - `E2E_BASE_URL=https://tanda2026.com.ar pnpm exec playwright test` (smoke público mobile y desktop, axe y CSP).
   - Spec temporal: invitado → `/jugar` → Mundial → sala.
   - En la sala, que se pidan `avatar-*.glb` **antes** del primer penal (precarga).
   - Penal sin errores de consola ni violaciones CSP.
   - Borrar el spec temporal después.
4. Medir el TTFB p50 de `/`, `/perfil` y `/ranking` (10 requests en caliente) y el First Load JS. Comparar con F0 en `docs/PERF-BASELINE.md`.
5. Anotar el deploy en TODO.md y cerrar PR #2 (queda mergeado por el fast-forward).

**Riesgos y mitigación:**
- **El primer toque en login, registro o invitado paga los ~66 KB del cliente de Supabase**, que ahora se baja al tocar.
  - Medirlo en el smoke: tap → navegación.
  - Si pasa de 300 ms en "Fast 3G", agregar en esos componentes un `requestIdleCallback(() => import("@/lib/supabase/client"))`. No toca el presupuesto, que mide solo chunks de entrada.
- **La precarga de los GLB gasta datos del celu en la sala.**
  - Ya se respeta el modo de ahorro de datos (Save-Data).
  - Nada más que hacer.

---

## P1 — Ramas de deps (S–M)

**Qué hay (✔):**
- `wip/deps-major` (2a97cd9) ya incluye `wip/fix-iat-dedupe` (merge 7116116). Trae:
  - three 0.187, @supabase/ssr 0.12.7, vitest 5.1 (+ vite 8), eslint 10.15, Supabase CLI 3.1 y TS ~6.0;
  - la migración `20261122000000_explicit_function_grants`.
- Está basada en el main viejo `714b898`, antes de F1.
- Archivos que se pisan con esta rama: solo `package.json`, `e2e/flow/ranked.spec.ts` y `TODO.md`. El lockfile se regenera.

**Por qué ahora (después de P0, antes de todo lo demás):**
- P2 y P7 tocan three y los tests. Hacer F5 sobre three 0.184/vitest 3 y migrar después duplica el trabajo de verificación.
- Las deps son ortogonales a G–K.

**Riesgo principal (✔ leyendo la migración).** `explicit_function_grants` es un **barrido dinámico**:
- revoca EXECUTE a `public, anon, authenticated` en **todas** las funciones de `public`;
- vuelve a dar acceso solo a una allowlist fija;
- cambia los default privileges.

Consecuencias:
- Con la versión `…22…`, en un `db reset` local corre **antes** de `…23…` (phase_close, ranked_k32_window, awards). En prod, en cambio, correría **después**. Mismo SQL, distinto orden: local y prod no quedarían iguales.
- Si mañana una fase suma una RPC de cliente y no la agrega a la allowlist y al `rls_audit`, el barrido la deja inaccesible (y lo inverso: una interna quedaría abierta si se agrega por error).

**Pasos:**
1. En este worktree: `git rebase origin/main wip/deps-major` sobre una rama nueva `feat/deps` (no muevo la rama de la otra sesión).
   - Conflictos esperables: `package.json` (los scripts `perf:budget`, `test:e2e:flow` con puerto, etc. se suman a las versiones nuevas), `ranked.spec.ts` (gana la versión de F3, con `openPlay`, más la anotación de crash de deps) y TODO.
   - `pnpm install` para regenerar el lock.
2. **Renumerar** la migración a `20261124000000` (corre después de todo lo que ya está en prod; local = prod).
3. Comparar la allowlist con las RPC que llama el cliente hoy:
   - `grep -rhoE 'rpc\("[a-z_]+"' lib components app | sort -u` debe ser ⊆ `auth_allow`.
   - Test nuevo en `rls_audit`: "toda RPC llamada desde el cliente está en la allowlist", con el mismo grep convertido en test de Vitest. **Así un RPC nuevo sin grant rompe CI, no prod.**
4. Ensayo en prod antes de aplicar, con una query de solo lectura por MCP:
   ```sql
   select p.proname, has_function_privilege('authenticated', p.oid, 'execute') as auth_exec,
          has_function_privilege('anon', p.oid, 'execute') as anon_exec
   from pg_proc p where p.pronamespace = 'public'::regnamespace order by 1;
   ```
   El resultado tiene que coincidir con la allowlist. Si alguna función con `auth_exec` no está en la lista, se para y se agrega.
5. Verde completo (incluye champion, que la otra sesión ya corrió con estas deps).
6. Fast-forward a main y deploy. Aplicar la migración por MCP, reconciliar el ledger a `20261124000000` y correr `get_advisors`.
7. Smoke en prod.
8. Rebase de `feat/feedback-1411` sobre main.
9. Las ramas `wip/deps-major` y `wip/fix-iat-dedupe` quedan sin tocar hasta que la otra sesión confirme que se pueden borrar (**pregunta 7**).

---

## P2 — Limpieza: muñeco viejo, placeholder, T-pose y código muerto (M)

### P2.1 Fuera `AvatarModel`

**Causa (✔):**
- `components/avatar/Avatar3D.tsx:15-16` envuelve `GlbAvatar` en `<ErrorFallback fallback={<AvatarModel/>}>` y `<Suspense fallback={<AvatarModel/>}>`.
- Mientras baja el GLB (o si falla), se dibuja el muñeco procedural de 516 líneas. Por eso "aparece primero el viejo y después el GLB".

Ninguna regla lo atrapa porque el fallback fue una decisión de diseño de la Fase 6b ("fallback mientras carga", anotada en CLAUDE.md). El problema no es un bug: es una decisión equivocada que quedó escrita como regla.

**Cambio:**
1. Borrar `components/avatar/AvatarModel.tsx` y `components/avatar/Avatar3D.tsx`. `PenalScene` y `AvatarCanvas` usan `GlbAvatar` directo.
2. `rigPose.ts`: ya no hay "pivotes de AvatarModel". El rig registra pivotes fantasma solo para `GlbAvatar`. Actualizar los comentarios (`glbRig.ts:38`, `rigPose.ts:2,13`, `lib/avatar/rig.ts:3`, `lib/avatar/parts.ts:3`).
3. **La carga va afuera del `<Canvas>`, no adentro.** `PenalSceneViewer` y `AvatarViewer` montan el Canvas recién cuando el GLB está en la caché:
   - Hook `useGlbReady(bodies)`: promesa de `useLoader.preload` más un estado `loading | ready | error`, con reintento.
   - Mientras carga: `components/ui/Skeleton3D.tsx`, un recuadro neutro de la escena con la trama de puntos de la marca y un pulso CSS (`motion-safe`). **Nunca una silueta.** Penal: el fondo de la tarjeta queda papel; la tarjeta de pregunta no espera al 3D (se puede responder sin la escena).
   - Si falla: `components/ui/LoadError.tsx` con "No pudimos cargar los jugadores 3D." más el botón outline "Reintentar" (limpia la caché de `useLoader` y vuelve a pedir). En el penal, el juego sigue sin escena (el 3D es decorativo; la regla del juego no depende de él).
4. `ErrorFallback.tsx` queda como error boundary genérico (`fallback` = `LoadError`). `WarmGlbBodies` pasa a ser `preloadGlbBodies()` en el creador.
5. `CLAUDE.md`: reemplazar "con `AvatarModel` (primitivas propias) como fallback mientras carga" por "sin fallback 3D: skeleton neutro mientras carga y estado de error con reintento".

**Regla que lo fija:**
- e2e flow `penal.spec` (nuevo): con la ruta de los GLB demorada 2 s (`page.route` con delay) se ve `[data-testid=scene-skeleton]` y **no** hay canvas hasta que llega el GLB. Con la ruta abortada se ve `[data-testid=scene-error]` y "Reintentar"; el penal se puede responder igual.
- knip: con `AvatarModel` borrado no puede quedar código que solo usaba él. Ver P2.4.

### P2.2 T-pose antes de patear (bug de prod, va acá y no en F5)

**Mecanismo (✔ leyendo el código):**
- El bind del GLB de Quaternius **es T-pose** (`glbRig.ts:6`).
- Los brazos bajan solo cuando corre `driveGlbRig` (`GlbAvatar.tsx`, `useFrame(() => driveGlbRig(...))`), o sea **solo en un frame renderizado**.
- Si no hay frame después de montar el GLB, el personaje se ve en bind, es decir en T-pose.

**Causa probable (⚠, a confirmar con el test del punto 1):**
- Regresión de `85b48d0`: con `frameloop="demand"` mientras se responde (`PenalScene.tsx`, `live ? "always" : "demand"`), el único frame depende de un `invalidate()`.
- Al resolverse el Suspense, el fallback `AvatarModel` des-registra sus pivotes y `GlbAvatar` registra los suyos en otro layout effect.
- Si ese frame se dibuja antes de que los pivotes estén registrados, o con el arquero (otro GLB) todavía suspendido, `driveGlbRig` corre sobre pivotes vacíos y queda la T-pose hasta la jugada.
- Gino lo vio el 14/11 a las 19:40, después del deploy de 18:45, que ya incluía `85b48d0`.

**Por qué nada lo atrapó:**
- El test del rig (`lib/avatar/rig.test.ts`) prueba poses puras, no que el GLB las reciba.
- El e2e no mira el 3D.
- `/dev/penal` corre con frameloop `always`.

**Cambio (estructural: el bind no puede verse nunca):**
1. Test primero (`components/avatar/glb.node.test.ts`, three en Node sin WebGL):
   - Carga `public/models/avatar/avatar-*.glb` con `GLTFLoader.parse` y el decoder meshopt.
   - Corre `templateOf` + `instantiate` **sin ningún frame**.
   - Afirma que la dirección del húmero en mundo (`upperarm_l/r`) forma menos de 35° con −Y (brazos abajo). Hoy tiene que fallar (T-pose = 90°).
2. `instantiate()` aplica `driveGlbRig` con la pose `READY` (pose explícita de preparación) **al crear la instancia**. El bind deja de existir para la UI.
3. **Cada estado de la escena declara su pose.** En `lib/penal/scene.ts`, un mapa `SCENE_POSES: Record<SceneState, (t) => Pose>` con estos estados:
   - `question` (pateador `KICK_READY`: perfilado, peso atrás; arquero `KEEPER_READY`);
   - `kick`, `dive`, `celebrate`, `dejected`;
   - `reduced` (pose final).

   `PenalScene` lee de ahí. Test puro (`scene.test.ts`): para cada estado y para t ∈ {0, 0.1, …, 3}, ninguna pose es `REST`/bind; los hombros están rotados al menos 0.9 rad respecto del bind.
4. `GlbAvatar` llama a `invalidate()` **después** de registrar los pivotes (el mismo layout effect, no otro).
5. e2e de pixel (en `scripts/avatar/qa.mts`, ver P7a): captura la escena del penal en estado `question` con frameloop demand y mide el ancho de la silueta a la altura de los hombros. La T-pose duplica el ancho, así que un umbral alcanza.

### P2.3 Compat de F2/F3b que ya cumplió su función

**Contexto (✔):**
- `get_profile_stats` devuelve `'divisions', '[]'` "para el front viejo" (`20261123000002_awards.sql:127,172`).
- `ranked_players.placement_left` está en 0 y nadie la lee desde TS: el grep no da nada fuera de SQL.
- `ranked_apply_result` todavía la devuelve en su `returns table` (`…k32_window.sql:18`).

**Migración `…_compat_cleanup`** (después de que el front en prod no lea `divisions`; ya no la lee desde F3b):
- `get_profile_stats` sin `divisions`.
- `ranked_apply_result` sin `placement_left` (drop + create, con los mismos grants).
- `alter table ranked_players drop column placement_left`.
- Tipos en `lib/ranked/types.ts` y `database.types.ts`.

Test de DB: `ranked.test` / `awards.test` ajustados, más un test que afirma que la key `divisions` no está.

### P2.4 Pasada de código muerto

**Estado (✔ hoy):** `pnpm exec knip` da 0 hallazgos. Knip no ve:
- (a) código que solo usaba `AvatarModel`: `lib/avatar/parts.ts`, partes procedurales; `rigPose.ts` "pivotes";
- (b) assets no referenciados;
- (c) SQL de compat;
- (d) textos que contradicen la regla.

| Qué | Dónde | Acción |
|---|---|---|
| Muñeco procedural | `AvatarModel.tsx`, `Avatar3D.tsx` | borrar (P2.1) |
| Cresta generada en runtime (mohicano) | `glbCrest.ts` + `applyHair(…, crest)` | se borra en **P7b** (cambia el catálogo; hasta entonces el v1 "mohawk" lo usa) |
| Texto falso | `lib/errors.ts:12` "pasaron los 2 minutos" (la sala dura 1 min, `game_modes.sql:131`) | pasa a salir de `TIMING` (P3) |
| Docs viejas | `docs/BRIEF.md:194,218,281` "2 minutos" · `DESIGN-RULES.md` fila "sin footer" | se corrigen en P3 / P4 |
| Assets | `public/flags` (49), `public/crests/{arg,div}`, `public/cups` (3), GLB | script `scripts/assets/unused.ts`: lista los archivos de `public/` cuyo nombre o ruta no aparece en `app\|components\|lib\|data` ni en el seed SQL; corre en CI (falla si hay huérfanos) |
| Compat SQL | `divisions`, `placement_left` | P2.3 |
| Funciones SQL reemplazadas | el baseline tiene versiones viejas de `create_room`, etc., pisadas por `create or replace` | sin acción: el baseline es historia. Se documenta en `supabase/README` que la fuente viva es "la última migración que define la función" |

---

## P3 — J: tiempos de juego en una sola fuente; salas a 30 s (S)

**Dónde vive hoy cada tiempo (✔):**

| Tiempo | Valor | SQL | TS / UI |
|---|---|---|---|
| Espera de sala (crear o partida rápida) | 1 min | `create_room`: `now() + interval '1 minute'` (`20261114000000_game_modes.sql:131`; `quick_play` llama a `create_room`) | `lib/errors.ts:12` dice **"2 minutos"** ✗ · BRIEF dice 2 min ✗ · el Lobby lee `rooms.starts_at` (bien) |
| Penal abierto | 10 s | `open_next_round` / penal `deadline = now() + interval '10 seconds'` (`baseline_v2.sql:1667`) | bots `maxDelayMs: 10000` (`lib/engine/bot.ts:33`), duplicado e implícito |
| 2ª chance | 5 s | `phase_close.sql:141` | — |
| Entre penales / partidos | 3 s / 7 s | `baseline_v2.sql:2260,2264` (más `least(…, 7 s)` en l.455) | `RESULT_LINGER_MS` 2000/2500 en `TournamentLive`/`RankedLive` (depende del gap del server, en un comentario) |
| Presentación de torneo / grupos | 10 s · 4 s · 2 s | `game_modes.sql:365`, `baseline_v2.sql:351,358,392,2547` | `REVEAL_MS 2000`, `KO_LOSS_REVEAL_MS 4000` |
| Ranked: cara a cara | 8 s | `ranked.sql:259` | — |
| Cola ranked: presencia / purga | 8 s / 15 s | `ranked.sql:317,365,423`, `k32_window.sql:72` | — |
| Ventana ELO | 10 s / 20 s | `ranked_queue_window` | `lib/engine/ranked.ts` (con paridad ✔) |

**Causa:**
- Los tiempos son literales `interval '…'` sueltos en 6 migraciones.
- La UI repite algunos de memoria (textos, lingers que "calzan" con el gap del server).
- La paridad TS↔SQL existe solo para la regla de juego (`parity.test.ts`), no para los tiempos.
- Así se coló el "2 minutos" de `errors.ts`.

**Cambio (fuente única):**
1. `lib/engine/timing.ts`:
   ```ts
   export const TIMING = { lobbyS: 30, penaltyS: 10, secondChanceS: 5, betweenPenalsS: 3,
     betweenMatchesS: 7, presentationS: 10, groupsCloseS: 4, koGapS: 2, rankedVersusS: 8,
     queuePresenceS: 8, queuePurgeS: 15 } as const;
   ```
2. SQL `public.game_timing() returns jsonb immutable` con las mismas keys. **Todas** las funciones que hoy tienen un literal pasan a `make_interval(secs => (public.game_timing()->>'penaltyS')::int)`. Es un `create or replace` de cada una: `create_room`, `open_next_round`, `resolve_penalty`, `tick`, presentación, `ranked_create_match`, `ranked_poll`, purga.
   - **Decisión:** función inmutable y no tabla, porque nadie la edita en caliente y queda versionada en git.
   - La espera de sala va **por modo**: columna `game_modes.lobby_seconds int not null default 30`. Mañana un modo puede esperar distinto, y la UI la lee del registro.
3. Tests:
   - `supabase/tests/timing.test.ts`: `select public.game_timing()` es igual a `TIMING` (paridad).
   - `create_room` crea con `starts_at - now() ≈ lobby_seconds`.
   - Un grep-test: no puede haber `interval '\d+ second` fuera de `game_timing` en las migraciones nuevas (lint de SQL en `scripts/db/check-migrations.ts`).
   - Unit: `BOT_TIERS.maxDelayMs ≤ TIMING.penaltyS*1000`.
4. UI y textos: `errors.ts` → `` `Esa sala ya cerró: pasaron los ${TIMING.lobbyS} segundos.` `` · BRIEF y SPEC actualizados · los lingers del cliente se expresan en función de `TIMING.betweenMatchesS` (con un test que exige linger < gap).
5. Deploy: front primero (lee `starts_at`, nada se rompe) y después la migración.
   - Smoke en prod: crear una sala y ver el contador arrancar en 0:30.

**Pregunta 2:** ¿30 s también para "partida rápida" o solo para "con amigos"? Recomendación: las dos (es el mismo lobby).

---

## P4 — G: modelo de layout único (M)

### Diagnóstico

**Origen del reclamo (✔, `git show 25199bc^:app/layout.tsx`):**
- Antes de F1, el `<body>` era `flex h-dvh flex-col overflow-hidden` con `{children}<Footer/>` como hermanos.
- La página nunca scrolleaba (`overflow-hidden`): cada pantalla era un `<main overflow-y-auto>` interno, y el footer quedaba **clavado al fondo del viewport en todas las pantallas**. No era `fixed`, pero se comportaba igual.
- F1 lo interpretó como "sacar el footer en juego" y **conservó el modelo** (body `h-dvh overflow-hidden`, `app/layout.tsx:71`). Arregló la consecuencia, no la causa.

**Por qué la regla de F1 no lo atrapó (✔, `e2e/flow/nav.spec.ts:17`):**
- Mide `document.scrollingElement.scrollHeight <= innerHeight`. Con body `overflow-hidden` **siempre** da verdadero, porque el scroll vive en el panel interno (`partido/page.tsx:28`, `Lobby.tsx:160`, `RankedQueue.tsx:106`).
- Solo corre en Pixel 7.
- No pasa por el bracket.
- La regla escrita en `DESIGN-RULES.md` ("game sin footer") fijaba la interpretación equivocada.

**Scroll en el mata-mata con espacio sobrante (✔):**
- `Bracket.tsx:187-197`: el árbol es de **un solo lado**, con columnas `w-32` y celdas apiladas `flex-1`.
- 16avos son 16 llaves en una columna, unos 800 px de alto, dentro de `max-w-3xl` (`Bracket.tsx:247`).
- En desktop sobra ancho a los costados y falta alto, así que hay scroll vertical en el panel.
- Además, todas las pantallas usan `max-w-md` (13 lugares) aunque haya 1440 px: diseño "estirado del celu".

### Auditoría completa (✔ grep de clases en `app/` + `components/`, sin `/dev`)

**Alto, scroll y posicionamiento:**

| Archivo:línea | Clase | Por qué está | Veredicto |
|---|---|---|---|
| `app/layout.tsx:70` | `html h-full` | base del modelo `h-dvh` | **va** (pasa a documento normal) |
| `app/layout.tsx:71` | `body flex h-dvh flex-col overflow-hidden` | shell que no scrollea: **causa raíz** | **va** → `min-h-svh flex flex-col` + `<Footer/>` al final, en el flujo |
| `app/(app)/layout.tsx:11,13` | `min-h-0 flex-1` + `main overflow-y-auto overscroll-contain` | scroll interno de la app | **va** (scrollea el documento) |
| `app/(game)/layout.tsx:8` | `main min-h-0 flex-1 overflow-hidden overscroll-none` | "pantalla fija" | **va** → `GameStage` (ver regla) |
| `app/(auth)/layout.tsx:12` | `main min-h-0 flex-1 overflow-y-auto` | scroll interno | **va** |
| `app/auth/reset/page.tsx:20` | idem | idem | **va** |
| `app/error.tsx:27` · `app/not-found.tsx:10` | idem | idem | **va** |
| `app/page.tsx:43` | `main min-h-0 flex-1 overflow-y-auto` | idem | **va** |
| `app/(game)/partido/page.tsx:28` | panel `overflow-y-auto overscroll-contain` | scroll del bracket/resumen | **va**: el bracket se rediseña para entrar; si no entra, scrollea el documento |
| `components/lobby/Lobby.tsx:160` | `min-h-0 flex-1 overflow-y-auto` | scroll interno | **va** |
| `components/ranked/RankedQueue.tsx:106` | idem | idem | **va** |
| `app/(game)/ranked/page.tsx:20` · `sala/[code]/page.tsx:39` | `min-h-0 flex-1` | hijo del shell `h-dvh` | **va** (lo reemplaza `GameStage`) |
| `components/penal/PenalLive.tsx:385` | escena `fixed inset-0 z-0` | escena de fondo del penal | **va** → `absolute inset-0` dentro del `GameStage` (si no, tapa el footer al scrollear) |
| `PenalLive.tsx:440` | globo de resultado `fixed top-[8%]` | anclar arriba del arco | **va** → `absolute` dentro del stage |
| `PenalLive.tsx:495,499` | tarjeta `fixed top-[4%]` + `max-h-[90svh] overflow-y-auto` | idem; scroll propio si no entra | **va** → `absolute` en el stage. El `max-h` + scroll interno **se queda** (es el único panel de controles que puede necesitarlo en 360×640) |
| `components/penal/Confetti.tsx:26` | `fixed overflow-hidden` | overlay transitorio, `pointer-events-none` | **se queda** (overlay permitido) |
| `components/ui/PitchBackground.tsx:4,13` | `fixed` + `h-[100svh]` | fondo decorativo detrás de todo | **se queda** (fondo permitido; `-z`, `aria-hidden`) |
| `components/bracket/Bracket.tsx:187` | `overflow-x-auto` | árbol más ancho que el celu | **se queda solo en mobile** (scroll horizontal **del panel**, nunca de la página); en ≥ `lg`, árbol de dos lados sin scroll |
| `components/ui/ScreenHeader.tsx:46,56` | `min-h-11` / `min-h-14` | área táctil 44 px / alto del header | **se queda** |
| `components/lobby/PlayMenu.tsx:88` | `min-h-26 overflow-hidden` | card de modo (recorta el filete) | **se queda** |
| `components/penal/TimeBar.tsx:21`, `DivisionProgress.tsx:29`, `ranking/page.tsx:65,75` | `overflow-hidden` | recorte de barras y tablas (rounded) | **se quedan** (no son layout) |
| `app/page.tsx:55,59` | `h-[3px]` | filete decorativo | **se queda** |
| `PenalLive.tsx:493` | `max-h-[90svh]` | ver arriba | **se queda** |
| `AvatarCreator.tsx:128`, `AvatarViewer.tsx:17`, `PenalSceneViewer.tsx:18`, `TeamReveal.tsx:39` | `h-full` | llenar el contenedor del canvas | **se quedan**; el creador se rehace en P7d |

**Ancho (`max-w-*`):**
- 13 pantallas usan `max-w-md`/`max-w-sm` en la raíz, y el bracket `max-w-3xl`.
- Todas pasan a la primitiva `Page` (abajo), con el ancho según el tipo de contenido.

### Regla única de layout (va a `docs/DESIGN-RULES.md`)

> **La página scrollea el documento, nunca un panel.**
> - El `body` es `min-h-svh flex flex-col`.
> - El contenido de cada pantalla ocupa **al menos el alto visible** (`min-h-svh` menos el header, vía `flex-1`), así que el footer queda en el flujo, **debajo** del contenido, y aparece solo al scrollear hasta el fondo.
> - Si el contenido es más alto, el documento scrollea y el footer sigue al final.
>
> **Nada `fixed` ni `sticky`**, salvo:
> 1. fondos decorativos (`PitchBackground`);
> 2. overlays transitorios (confeti, diálogos/sheets);
> 3. el `ScreenHeader` `sticky top-0` (la acción de volver siempre a mano).
>
> **Pantalla de juego = `GameStage`:** un escenario de exactamente un viewport (`h-svh` menos el header), `relative`. Escena 3D, tarjeta, globo y HUD van `absolute` **adentro del stage**. Mientras estás en el stage, los controles se ven fijos; al scrollear, aparece el footer debajo. Es "pegado lo que tiene que estar pegado" sin `fixed`.
>
> **Ancho por tipo de contenido**, con la primitiva `components/ui/Page.tsx` (`<Page width="form|content|wide">`):
> - `form` = `max-w-sm` (login, registro);
> - `content` = `max-w-2xl` (home, perfil, jugar), con grillas de 2 columnas desde `md`;
> - `wide` = `max-w-6xl` (bracket, tabla, historial).
>
> Padding lateral de 16 px en mobile y 24 px desde `md`. **Mobile first, pero diseñado también para desktop:** cada pantalla declara su layout de `lg` (no es "el celu estirado").
>
> Sin scroll horizontal de página nunca; si algo es más ancho (árbol en mobile), scrollea **ese componente** en X.

**Bracket (desktop):**
- En `lg+`, árbol **de dos lados**: mitad izquierda y mitad derecha convergiendo a la final en el centro. Divide el alto por dos y usa el ancho que hoy sobra.
- Grilla CSS con `grid-template-rows` por fase. Conectores con el mismo CSS de `.bracket-cell`, espejado.
- En mobile queda de un lado con scroll X del componente, y la columna de tu llave se centra con `scrollIntoView` al montar.
- Grupos en desktop: tu grupo más el resto en grilla de 2–3 columnas (hoy, una sola columna de 12 tablas).

**Lint que lo fija** (`eslint.config.mjs`, `no-restricted-syntax` sobre literales de className en `app/**` y `components/**`):
- Prohíbe `/\b(h-dvh|h-screen|overflow-y-auto|overflow-hidden.*flex-1|fixed)\b/`, salvo una allowlist explícita: `PitchBackground`, `Confetti`, `HelpSheet`, el panel de la tarjeta del penal y `Page`/`GameStage`.
- Mensaje: "Layout: la página scrollea el documento (DESIGN-RULES §Layout). Usá <Page>/<GameStage>."

### E2E por viewport (`e2e/layout.spec.ts`, nuevo)

Viewports: `360×640` (mobile chico), `430×932` (mobile grande), `820×1180` (tablet) y `1440×900` (desktop ancho). Se agregan como projects en `playwright.config.ts` solo para este spec, y lo mismo en el flow para las pantallas de juego.

Para cada pantalla del mapa `lib/nav/routes.ts` (landing, login, home, jugar, perfil, ranking, historial, avatar; flow: sala, cola ranked, partido-penal, bracket de grupos, bracket KO, resumen), afirmar:
1. **Hay footer** (`footer` count = 1) en todas, juego incluido.
2. **El footer no se ve al cargar** cuando el contenido llena: `footer.getBoundingClientRect().top >= innerHeight`. En juego siempre, porque el stage ocupa un viewport.
3. **Llegás al footer scrolleando:** después de `scrollTo(bottom)`, el footer está en el viewport.
4. **Nada fijo tapa contenido:** se buscan elementos `position: fixed|sticky` que no estén en la allowlist (por `data-layer="bg|overlay|header"`). Tiene que haber 0.
5. **Sin scroll horizontal:** `scrollWidth <= innerWidth`.
6. **Sin scroll innecesario en juego:** el `GameStage` mide `innerHeight − header` (±1 px) y ningún hijo del stage desborda (`scrollHeight <= clientHeight` del stage, salvo el panel de la tarjeta, que tiene su `max-h`).
7. **Uso del ancho en desktop:** en 1440, el bracket KO se dibuja sin scroll vertical del documento antes del footer (todo el árbol en `top < innerHeight`), y en las pantallas `wide` el contenedor mide al menos 1000 px.

Además, el `nav.spec` viejo cambia "sin footer" por las aserciones de arriba. **Esto revierte la parte "sin footer en `(game)`" de F1**, como pidió Gino en la corrección G.

---

## P5 — H: fin de partida y de torneo (M)

### Causas (✔)

1. **Circulitos del tablero de penales:** hay dos implementaciones distintas, `PenalHud.tsx:18-34` (`Dots`) y `RunSummary.tsx:26-50` (`PenalDots`).
   - Ninguna dibuja los **slots pendientes**: solo agregan un círculo por penal ya pateado.
   - Gol = relleno de tinta, errado = **contorno vacío** rojo. Por eso "aparecen ya vacíos o llenos según el resultado".
   - No hay verde/rojo ni "pendiente".
2. **Derrota en eliminatoria que llega tarde:** `participants.eliminated_phase` se escribe en `advance_ko_round` (`game_modes.sql:659-664`), **cuando termina toda la ronda**.
   - Para el perdedor de la final se escribe **cuando termina todo el torneo** (`game_modes.sql:599`, después del 3er puesto).
   - El cliente deriva "estoy afuera" de ese campo (`TournamentLive.tsx:283-286`), así que el cartel aparece tarde.
   - Encima, `KO_LOSS_REVEAL_MS = 4000` (l.53) es un timer fijo: mostrás el bracket 4 s y saltás al resumen sin poder volver.
3. **Botones del resultado:** "Inicio" es un `Link` de texto gris chico (`RunSummary.tsx:184-189`), "Jugar de nuevo" es un botón `lg`, y el CTA de invitado es otro estilo.
   - `RankedResult` y `Lobby` tienen su propia jerarquía.
   - No existe un componente común de "acciones de resultado".
4. **No hay máquina de estados:** el "qué se ve" sale de `if`s encadenados en el render de `TournamentLive` (`TournamentLive.tsx:239-313`) más timers sueltos (`REVEAL_MS`, `KO_LOSS_REVEAL_MS`, `RESULT_LINGER_MS`). Ningún test cubre las transiciones.

### Máquina de estados del torneo (cliente; datos del server)

Reducer puro `lib/tournament/flow.ts` (`nextView(state, facts, now)`), testeable sin red. `TournamentLive` y `RankedLive` solo lo renderizan.

```
                  ┌──────────────┐ 2 s
     (entrar) ──▶ │   REVEAL     │──────────┐   (refresh tardío → salta directo)
                  └──────────────┘          ▼
                                     ┌─────────────┐  penal abierto p/ mí   ┌────────────┐
              ┌────────────────────▶ │   BRACKET   │ ─────────────────────▶ │   PENAL    │
              │   (grupos / KO,      │ (espera de  │                        │ (pregunta) │
              │    VS del próximo)   │   ronda)    │ ◀──┐                   └─────┬──────┘
              │                      └──────┬──────┘    │ siguiente penal        │ resuelto
              │                             │           │ del mismo partido      ▼
              │                             │           │                 ┌────────────┐
              │                             │           └──────────────── │  RESULTADO │ (GOL/ATAJADO,
              │                             │                             │   PENAL    │  linger)
              │                             │                             └─────┬──────┘
              │                             │                 partido terminado │
              │                             │                                   ▼
              │   gané el partido           │                         ┌──────────────────┐
              └─────────────────────────────┼──────────────────────── │  FIN DE PARTIDO  │ marcador +
                                            │                         │   (≈ gap 7 s)    │ tablero lleno
                                            │                         └───┬──────────┬───┘
                                            │        perdí (KO) o quedé   │          │ gané la final
                                            │        afuera en grupos     ▼          ▼
                                            │                  ┌────────────────┐  ┌──────────┐
                                            │                  │ CRUCES (≥ 4 s, │  │ CAMPEÓN  │
                                            │                  │ hasta ver la   │  │ (confeti)│
                                            │                  │ ronda nueva)   │  └────┬─────┘
                                            │                  └───────┬────────┘       │
                                            │                          ▼                ▼
                                            │                  ┌─────────────────────────────┐
                                            │                  │ RESUMEN (derrota / podio)   │
                                            │                  │ [Jugar de nuevo]            │
                                            │                  │ [Ver cómo sigue] (si sigue) │
                                            │                  │ [Volver al inicio]          │
                                            │                  └──────┬──────────────────────┘
                                            │        "Ver cómo sigue" │      ▲ "Ver mi resultado"
                                            │                         ▼      │
                                            │                  ┌─────────────┴──┐ torneo terminado
                                            └───────────────── │  ESPECTADOR    │ ─────────────▶ RESUMEN
                                                               │ (bracket vivo) │   (con el campeón)
                                                               └────────────────┘
```

**Qué ve el usuario en cada estado:**

| Estado | Ve | Sale por |
|---|---|---|
| REVEAL | su selección/club (TeamReveal) | 2 s, o directo si recargó tarde |
| BRACKET | grupo o árbol más el VS de su próximo partido; "Esperando que todos terminen…" si ya jugó | penal abierto para él |
| PENAL | escena + tarjeta + HUD con el tablero (slots vacíos) | resultado del server |
| RESULTADO PENAL | animación + GOL/ATAJADO + correcta; **el slot de ese penal se pinta ahora** | siguiente penal o fin del partido |
| FIN DE PARTIDO | marcador final más el tablero completo | gap del server (`TIMING.betweenMatchesS`) |
| CRUCES | bracket actualizado **con la ronda siguiente ya armada** (su llave marcada "Eliminado") | `max(4 s, hasta que existan los partidos de la fase siguiente)`. Si perdió la final, 4 s |
| CAMPEÓN | trofeo + confeti | 4 s → RESUMEN |
| RESUMEN | desenlace, marcador del último partido y botones (abajo) | botones |
| ESPECTADOR | bracket en vivo con la cinta "Estás mirando · quedaste afuera en {fase}" más el botón "Ver mi resultado" | botón, o fin del torneo → RESUMEN con el campeón |

**Cambio en el server (raíz del "aparece al final"):** `eliminated_phase` (y `placement = 2` para el subcampeón) se escriben **cuando termina el partido**, en `finalize_match` (`baseline_v2.sql:943`) y en el camino de `progress_match` (l.1869), con la fase de ese partido.
- `advance_ko_round` sigue escribiendo lo mismo, pero idempotente (`where eliminated_phase is null`), para que `simulate_bot_match` y los torneos viejos queden bien.
- Excepción: los perdedores de semis con 3er puesto **no** se marcan (vuelven a jugar). Quedan como hoy.
- Los premios (`awards`) no cambian: se otorgan al pasar el torneo a `finished`.
- Migración `…_ko_eliminated_at_finish`.
- Test de DB: perder en octavos deja `eliminated_phase = 'round_of_16'` **antes** de que terminen los otros octavos; el subcampeón tiene `placement = 2` apenas termina la final, aunque el 3er puesto siga.

**Ranked** usa el mismo reducer con un subconjunto: VERSUS → PENAL ⇄ RESULTADO → FIN → RESUMEN ranked. Sin espectador: es 1v1.

### Tablero de penales (fuente única)

- `components/penal/PenaltyDots.tsx`, un solo componente para el HUD y el resumen.
- Dibuja `kicksPerSide` slots por lado desde el arranque. En muerte súbita suma uno por par.
- Estados: `pending` (contorno de tinta, vacío), `scored` (`bg-success`, ✔ en `aria-label`) y `missed` (`bg-danger`).
- El slot se pinta en `RESULTADO PENAL`, con una transición CSS `scale` + color, respetando reduced motion.
- Accesible: `role="img"` + `aria-label="Penales de {equipo}: gol, errado, pendiente…"`.
- Test unit del mapeo y snapshot del HUD.
- **Tokens (✔):** ya existen `--success #1d7a3e` (verde imprenta) y `--danger #d7261e` en `globals.css:39-40`. No hace falta agregar colores.

### Jerarquía de botones de resultado (una vez, para todas las pantallas)

`components/ui/ResultActions.tsx`, usado por `RunSummary`, `RankedResult`, error de torneo y cualquier pantalla de fin:

```
[      JUGAR DE NUEVO      ]   ← primary, lg, block (la única roja)
[      VER CÓMO SIGUE      ]   ← outline, lg, block (solo si el torneo sigue en juego)
[     VOLVER AL INICIO     ]   ← outline, lg, block
  ¿Querés guardar esto? Creá tu cuenta →   ← invitado: tarjeta/aviso debajo, no un 4º botón
```

- Mismo tamaño (`lg`, `block`, 48 px de alto) para todas. Solo cambia la variante.
- La API obliga: `primary: Action` (una), `secondary: Action[]` (máximo 2).
- La regla "una primaria por pantalla" (`e2e/_primary.ts`) ya lo verifica.

**Nombre del botón — recomendación: "Ver cómo sigue".**
- Dice qué vas a ver (el torneo que continúa), no solo "seguir" algo ambiguo.
- Es rioplatense y corto, y anticipa que es en vivo.
- Solo aparece mientras el torneo está en juego. Si ya terminó, no hay nada que "siga" y el botón se esconde: el resumen ya muestra al campeón.
- Alternativas: "Seguir mirando" (más neutro) o "Ver el torneo".
- **Pregunta 1.**

**Tests:**
- Unit `flow.test.ts`: cada transición de la tabla, los refresh tardíos (entrar en CRUCES/ESPECTADOR directo), "Ver cómo sigue" → ESPECTADOR → fin → RESUMEN, y que ningún estado quede sin salida.
- e2e flow `game.spec`/`champion.spec`:
  - al perder en KO, aparecen los cruces con la ronda siguiente **antes** del resumen;
  - el resumen tiene 3 botones del mismo alto;
  - "Ver cómo sigue" muestra el bracket vivo y "Ver mi resultado" vuelve.
- Tablero: al primer penal, el HUD muestra 5+5 slots `pending`; después de resolver, uno `scored|missed`.

---

## P6 — K: ayuda dentro de la app (S–M)

**Causa (✔):**
- Los textos de cada modo viven en `lib/modes/index.ts` (`name`, `tagline`) solo para Mundial y Argentino.
- Ranked y "sala con amigos" no son entradas del registro: están hardcodeados en `PlayMenu.tsx` (`RankedCard` l.168, sección "Con amigos" l.119).
- No hay ningún componente de diálogo/popover en el repo (grep `dialog|popover` = 0).
- Agregar un modo hoy no obliga a escribir su ayuda.

**Cambio:**
1. **Registro de formas de jugar:** `lib/modes/index.ts` suma `help: ModeHelp` **obligatorio** en `ModeMeta`.
   ```ts
   interface ModeHelp {
     format: string;
     players: string;
     win: string;
     ranked: string;
     long?: string;
   }
   ```
   Lo exige el tipo: un modo sin ayuda no compila.
   - Nuevo `PLAY_KINDS` en el mismo archivo para lo que no es un `game_mode` de torneo: `ranked` y `room` ("sala con amigos"), con el mismo `help`.
   - `lib/help/howto.ts` guarda el contenido de "Cómo jugar" (secciones cortas).
2. **Test que lo fija:**
   - `test:db` `modes_help.test.ts`: todo `game_modes.id` con `active = true` tiene `getMode(id).help` y `getMode(id).id === id` (hoy `getMode` cae a Mundial si no existe: el test exige que **no** caiga).
   - Unit: toda card de `PlayMenu` renderiza un `HelpButton` (el componente lo recibe del registro; no hay forma de pintar una card sin ayuda).
3. **Componente único `components/ui/HelpSheet.tsx`** (`"use client"`):
   - `<dialog>` nativo con `showModal()`: foco atrapado, `Esc` nativo, fondo inerte, sin dependencias.
   - Cierra al tocar afuera (`click` con `target === dialog`) y con un botón "Entendido".
   - Bottom sheet en mobile (anclado abajo, `max-h-[85svh]`, scroll interno propio por ser overlay permitido) y centrado `max-w-md` desde `md`.
   - Animación CSS (slide/fade) con `motion-safe`. Devuelve el foco al disparador.
   - Disparador `HelpButton`: un "?" circular de 44 px, `aria-label="Cómo se juega {modo}"`, `aria-haspopup="dialog"`.
4. **`/jugar`:** cada card de modo (Mundial, Argentino), la de Ranked y la sección "Con amigos" llevan su "?" arriba a la derecha, sin tapar el toque de la card: el "?" está fuera del área del botón principal de la card.
5. **Home:** entre "Jugar" (primaria) y "Mi perfil", un botón outline `lg` **"Cómo jugar"** que abre `HelpSheet` con `howto`. Sigue habiendo una sola primaria (la verifica `_primary.ts`).
6. **e2e:** abrir y cerrar con Esc y con tap afuera, el foco vuelve, axe sin violaciones con el sheet abierto, y en `/jugar` hay un "?" por card.

**Borrador de textos** (cortos, mobile first; Gino los ajusta):

- **Mundial:** "48 selecciones en 12 grupos de 4. Pasan las 2 primeras de cada grupo y los 8 mejores terceros a 16avos, y de ahí mata-mata hasta la final (con partido por el 3er puesto). Jugás vos y 47 rivales (personas o bots). Ganás cada partido metiendo más penales. No suma puntos de ranked."
- **Fútbol argentino:** "30 clubes en 2 zonas de 15. Pasan los 8 mejores de cada zona a octavos y se define a mata-mata, sin 3er puesto. Jugás vos y 29 rivales (personas o bots). No suma puntos de ranked."
- **Ranked:** "Un mano a mano contra otra persona de nivel parecido: una tanda de 5 penales y, si empatan, muerte súbita. Ganar suma puntos de liga y perder resta (hasta ±32 según el rival). Subís de división con los puntos. Es lo único que mueve tu ranking."
- **Sala con amigos:** "Creá una sala, pasales el código y entran con 'Unirme'. La sala arranca a los {TIMING.lobbyS} segundos o cuando se llena; los lugares vacíos los completan bots. Mismo formato que el modo que elijas. No suma puntos de ranked."
- **Cómo jugar (home):**
  1. **Cada pregunta es un penal.** Uno patea y el otro ataja. Aparece una pregunta con 3 opciones y tenés {penaltyS} segundos.
  2. **Pateás:** si acertás y tu rival no, es gol. **Atajás:** si acertás y el que patea no, la atajás.
  3. **Si los dos aciertan, gana el más rápido.** Tu primer toque queda fijo: no se puede cambiar.
  4. **Tanda de 5 por lado;** si empatan, muerte súbita.
  5. **Torneos:** fase de grupos o zonas y después mata-mata hasta la final.
  6. **Ranked:** mano a mano por puntos de liga.

Los números (5, 10 s, 30 s) se interpolan de `TIMING` y `FORMATS`, nunca escritos a mano.

---

## P7 — I + F5: personaje impecable

Partido en 4 fases deployables. **Regla de Gino:** no se marca nada hecho sin revisar cada modelo en las capturas. El checklist manual (`docs/avatar-qa/REVIEW.md`) lleva un checkbox por pieza, cuerpo y ángulo, con link a la captura, y se completa a mano antes de cerrar P7a y P7d.

### Causas (✔ salvo donde dice ⚠)

| Síntoma | Dónde nace | Por qué no se atrapó |
|---|---|---|
| T-pose antes de patear | ver P2.2 (bind = T-pose y pose solo por frame) | no hay test que mire el GLB posado |
| Pelo largo y rodete "cortan la cabeza" | ⚠ los dos están en el GLB del pack (`Hair_Long`, `Hair_Buns` con `MI_Hair_*`) y se prenden sobre el cuerpo **sin validación**. Candidatos: (a) partes del cráneo atraviesan el pelo porque la malla viene de otro corte de cabeza; (b) el rodete pensado para el cuerpo F se usa en M; (c) el `kitMaterial`/escala del build cambia la cabeza. Se determina con el QA de P7a.1 antes de tocar nada | los assets entran sin QA; no hay render ni chequeo de penetración |
| Colores de pelo irreales | `COLOR_PALETTE` única para todo (`lib/avatar/parts.ts:64-75`), más `material.color` multiplicando una textura gris (~0,6): todo sale oscuro y el blanco gris; pelo y cejas comparten material | sin paleta por categoría ni tinte por luminancia |
| Ropa chillona | la misma paleta: `#e63946`, `#7209b7`, `#f4a261`… colores de UI saturados, ajenos a la marca "Programa" (papel/tinta) | sin curaduría ni tokens |
| No se ve la cara de adelante de los zapatos | `components/avatar/glbShoes.ts`: el zapato es un **loft procedural** (`SLICES=12`, `RING=12`) "con las secciones extremas achicadas" (l.92-100) pero **sin tapa en la punta ni en el talón**, más `computeVertexNormals` sobre un tubo abierto (l.185-187). ⚠ La cara frontal es un agujero o tiene winding invertido; con `FrontSide` se ve el interior (el "fondo"). A confirmar con el chequeo de malla cerrada | sin test de malla cerrada ni de orientación de normales |

### P7a — QA visual automático + fixes de assets (L)

**P7a.1 Galería de QA (herramienta, primero):**
- Ruta dev `app/dev/avatar/qa/page.tsx` (404 en prod, como `/dev/kit`). Renderiza **una** pieza por query: `?body=male|female&piece=hair:long|shoe:cleats|top:tee|…&view=front|q34|side|back|top|feet|low&pose=ready|kick|dive|celebrate`.
  - Canvas determinista: `frameloop="demand"`, `preserveDrawingBuffer`, DPR 1, 768×768, fondo neutro, luz de estudio fija, sin animación.
- `scripts/avatar/qa.mts` (Playwright, Chrome del sistema, WebGL por software en CI): recorre la matriz **cuerpo × pieza × vista × pose clave** y guarda en `artifacts/avatar-qa/<sha>/…png`.
  - Arma `index.html` con una hoja de contactos: una fila por pieza, columnas por vista, M/F lado a lado.
  - Script `pnpm qa:avatar`. En CI se sube como artefacto del workflow (no se commitean PNG).
- Vistas: frente, 3/4, perfil, espalda, cenital de cabeza (para el pelo), primer plano de pies desde adelante y desde abajo (zapatos), más un contrapicado.
- Poses: `ready`, `kick` (contacto), `dive` (estirada) y `celebrate`, para ver pelo y zapatos en movimiento.

**P7a.2 Chequeos geométricos (unit, Node, sin WebGL; `scripts/avatar/checks.ts` + `lib/avatar/assets.test.ts`).** Se abren los GLB con `@gltf-transform/core` y three (`GLTFLoader.parse` + meshopt).

| Chequeo | Cómo | Umbral |
|---|---|---|
| **Pelo cubre el cráneo** (sin "cabeza cortada") | Por peinado y cuerpo, en bind y en las 4 poses (skinning en CPU con `SkinnedMesh.applyBoneTransform`): cada vértice de la cabeza por encima de la línea de la frente (`y > browY`) lanza un rayo hacia afuera por su normal; si el primer hit con la malla de pelo está a más de 4 cm o no hay hit, ese vértice "asoma". | 0 vértices asomando en la zona que el peinado declara cubrir (`covers: "crown" \| "full" \| "sides"` en el catálogo) |
| **Penetración pelo↔cabeza** | Vértices del pelo dentro del volumen de la cabeza (rayo desde el centro del cráneo: cuenta de intersecciones impar). | < 1% de los vértices del pelo, y ninguno a más de 5 mm de profundidad |
| **Bounding de la cabeza** | El AABB de pelo + cabeza entra en el cuadro de cámara de "Pelo" del creador (que el zoom no corte arriba) y en el near plane de la cámara del penal. | contiene la cabeza con 10% de margen |
| **Normales invertidas** | Por triángulo: normal geométrica (winding) contra la media de las normales de vértice; y en mallas cerradas, volumen con signo > 0. | < 0,5% de triángulos en desacuerdo; volumen > 0 |
| **Malla cerrada (zapatos)** | Conteo de aristas de borde (usadas por un solo triángulo). | 0 en capellada + suela (la boca del botín se tapa con un anillo interno) |
| **Material de una cara** | Toda malla cerrada tiene `side = FrontSide` **y** pasa los dos chequeos anteriores; las abiertas (pelo con mechones de un plano) declaran `DoubleSide` en el catálogo. | ninguna malla abierta con `FrontSide` |
| **Skinning sano** | Pesos que suman 1 ± 1e-3; huesos existentes; ningún vértice de pelo pesado a huesos fuera de `head`/`neck`. | exacto |
| **Sin T-pose** | ver P2.2 (pose al instanciar y `SCENE_POSES`). | húmero < 35° con −Y en todos los estados |
| **Catálogo ↔ GLB** | Cada malla declarada por peinado y cuerpo existe en el GLB de ese cuerpo; no hay mallas de pelo en el GLB fuera del catálogo. | exacto |

**P7a.3 Fixes de assets (solo después de ver la galería y los chequeos en rojo):**
- **Pelo:** curar por cuerpo con el pack gratis.
  - Candidatas: `SimpleParted`, `Long`, `Buzzed`, `BuzzedFemale`, `Buns` y `Beard` (nueva en el Standard).
  - Cada peinado que no pase "cubre el cráneo" en un cuerpo **no se ofrece en ese cuerpo**. Si se puede arreglar en el build, se arregla en `scripts/avatar/build-glb.mts`: escala/offset por cuerpo, o empujar los vértices del cráneo que asoman hacia adentro, solo en la zona cubierta.
  - Se borra la cresta en runtime (`glbCrest.ts`): el mohicano no existe en el pack.
  - Resultado esperado: unos 4 peinados por cuerpo más pelado; la lista final sale de la galería.
- **Material de pelo propio:** separar pelo y cejas en el build (material `MI_Hair_*` duplicado para las cejas) o clonar en runtime. Tinte por **luminancia** en el shader (`mix` en espacio lineal: el color elegido es el que se ve, con la textura aportando solo el detalle). Cejas siguen al pelo con un factor de oscurecimiento.
- **Zapatos:** cerrar el loft (tapa de la punta con fan desde el centroide de la última sección, tapa del talón y anillo de la boca), normales recalculadas con winding hacia afuera (test de volumen > 0) y `FrontSide`. Puntera con una leve curva hacia arriba para que la cara frontal se lea en el plano de la cámara del penal.
- **Piel:** tinte de la región `aHead`/piel en el `kitMaterial` existente (ya decide la región por fragmento) con la paleta de piel. El pack trae la textura `Light`, que se agrega al build como base clara para que los tonos claros no salgan grises.

**P7a.4 Paletas curadas** (tokens en `lib/avatar/palette.ts`, separadas por categoría; **pregunta 3** para que Gino apruebe con la lámina de swatches que sale de la galería):

| Paleta | Colores |
|---|---|
| **Pelo** (natural, 8) | negro `#1E1B19` · castaño oscuro `#3A2A20` · castaño `#5B3E2B` · castaño claro `#80593B` · rubio oscuro `#A07D4E` · rubio `#CFAE76` · colorado `#8C3F24` · canoso `#A9A6A0` |
| **Piel** (6) | `#F2D3BC` · `#E0B593` · `#C68E66` · `#A06B45` · `#764A2E` · `#4D3020` |
| **Ropa** (10, apagada, en clave "Programa") | tinta `#1C1C1C` · crudo `#ECE6D8` · gris cemento `#8A8984` · azul marino `#1F2B47` · azul club `#2C4A9A` · celeste lavado `#8FB2D3` · rojo ladrillo `#A8352B` · bordó `#6B2433` · verde botella `#2E5A3C` · mostaza `#C4A042` |
| **Botines** (6) | tinta `#1C1C1C` · crudo `#ECE6D8` · rojo ladrillo `#A8352B` · azul club `#2C4A9A` · mostaza `#C4A042` · gris `#8A8984` |

**Decisión:** sin colores de fantasía en el pelo (Gino pidió "realistas"). Contraste: la tarjeta de paleta valida que la remera y el short elegidos tengan delta-E ≥ 15 contra la piel elegida (si no, se lee "desnudo").

**Recordatorio:** en el penal, la camiseta la pinta la **nación** (`PenalScene` con `kitTop`). La paleta de ropa del jugador se ve en el creador, en ranked (`participant_brief` usa los colores del avatar) y en la galería.

**Criterio de P7a:** todos los chequeos verdes, más `REVIEW.md` completo a mano (cada fila con su captura revisada) y las capturas en el PR. Deploy: los GLB nuevos y los fixes de material salen con el front v1. El catálogo nuevo todavía no se ofrece hasta P7b.

### P7b — Schema v2 + catálogo único + front que lee v1 y v2 (M)

- `lib/avatar/catalog.ts`: **una tabla** por categoría (`hair`, `beard`, `skin`, `kit`, `boots`) con id, label, miniatura, mallas por cuerpo (`bodies: {male?: string[], female?: string[]}`), `covers`, `side` y el foco de cámara. La leen el creador, `GlbAvatar`, la galería de QA y los tests.
- `lib/avatar/schema.ts`: `AvatarV2 = { v: 2, body, skin, hair: {style, color}, beard: style | null, kit: {shirt, shorts}, boots: {style, color} }`.
  - Parse **por campo** con default por campo (un dato raro no resetea el resto), escrito a mano sobre el catálogo.
  - **Decisión:** no uso zod en runtime: está solo en `devDependencies` y sumaría unos 13 KB gz a la ruta del creador para algo que el catálogo ya define.
  - Combinaciones cuerpo + peinado que no existen → el más parecido declarado (`fallbackFor` en el catálogo).
  - Test de propiedades (mulberry32, 2000 casos): `parse(cualquier cosa)` siempre da un avatar válido del catálogo.
- `lib/avatar/migrate.ts`: `migrateAvatar(unknown): AvatarV2` puro.
  - v1 `hair.part` pasa a style: `short`→`parted`, `mohawk`→`buzz`, `bun` en M → `parted`.
  - `top.color` y `bottom.color` van al **color de la paleta nueva más cercano** (delta-E).
  - `shoes` pasa a `boots`.
  - Tests con los avatares reales de prod: dump de solo lectura por MCP (`select avatar, count(*) group by 1`), que se usa como fixture.
- Front: todo consumidor lee con `parseAvatar(raw)`, que acepta v1 (migrando en memoria) y v2. Archivos: `lib/penal/scene.ts`, `realtime/penal.ts`, `ranked/types.ts`, `guest/anon.ts`, `database.types.ts`, `app/(app)/avatar/*`, `/dev/*`.
- `saveAvatar` valida **estricto** (rechaza lo que no esté en el catálogo).
- Deploy: el front v1+v2 queda solo en prod (nada escribe v2 todavía, salvo el creador viejo, adaptado para guardar v2).

### P7c — Migración SQL de avatares a v2 (S)

- `…_avatar_v2.sql`:
  - backup en `profiles_avatar_backup(id, avatar, migrated_at)`;
  - `UPDATE` determinista con la **misma tabla de mapeo** que `migrate.ts`, generada desde el TS a un `values (…)` por un script, así no hay dos tablas escritas a mano;
  - `participant_brief` lee `coalesce(avatar #>> '{kit,shirt}', avatar #>> '{top,color}')`;
  - default v2 en la columna y en `handle_new_user`;
  - función `avatar_is_valid(jsonb)` como `CHECK` (versión mínima: `v = 2` y keys presentes; el detalle lo valida el front).
- Ensayo en prod antes: `select` del mapeo, conteos por estilo antes y después. Reversible desde el backup.
- Test de DB: mapeo de fixtures v1 → v2 igual a `migrateAvatar` (paridad), y el CHECK rechaza basura.

### P7d — Creador nuevo (L)

Lo del plan original (sección C) más lo de I:
- **Primera vez:** 8 presets armados con el catálogo (variedad de cuerpo, piel y pelo) más "Aleatorio".
- **Editor:** personaje arriba (~55 dvh, drag para rotar, pinch para zoom) y panel abajo con pestañas con ícono: **Cuerpo · Piel · Pelo · Cara (barba, solo M) · Equipo · Botines**.
  - Grillas de miniaturas, generadas offline por la misma herramienta de QA (`scripts/avatar/thumbs.mts`, PNG en `public/avatar/thumbs/`, sin un canvas por chip).
  - Swatches de la paleta de cada categoría.
- **Cámara por pestaña:**
  - lerp en `useFrame` (con reduced motion, corte directo);
  - `data-focus` en el contenedor para el e2e;
  - Pelo, Cara y Piel enfocan la cabeza; Botines, los pies; el resto, cuerpo entero.
- **Siempre visibles:** Aleatorio (dado; solo combinaciones válidas del catálogo), Deshacer y **Guardar** (la única primaria, sticky en el panel; el header es la única otra excepción `sticky`).
- Volver con cambios sin guardar muestra un aviso inline (`HelpSheet` reutilizado como confirmación, sin `confirm()`).
- Pose del creador: `READY`/`IDLE` (nunca bind, garantizado por P2.2).
- **e2e** `flow/avatar.spec.ts` (mobile y desktop): registro → preset → pestaña Pelo (`data-focus=head`) → cambiar peinado y color → Botines (`data-focus=feet`) → Aleatorio → Guardar → recargar y que persista → el penal lo usa (escena con el avatar). Más axe.
- **Criterio:** galería de QA del creador (capturas de cada pestaña en 360 y 1440) revisada a mano en `REVIEW.md`.

---

## Preguntas para Gino (solo lo que es suyo; con mi recomendación)

1. **Nombre del botón para seguir mirando el torneo.** Recomiendo **"Ver cómo sigue"** (dice qué vas a ver; aparece solo si el torneo sigue). Alternativas: "Seguir mirando", "Ver el torneo".
2. **Espera de 30 s: ¿también en "Partida rápida" o solo en "Con amigos"?** Recomiendo **las dos** (es el mismo lobby; 30 s con bots que completan no cambia la partida).
3. **Paletas** (pelo 8, piel 6, ropa 10, botines 6, en la tabla de P7a.4). Recomiendo **aprobarlas sobre la lámina de swatches** que sale de la galería de QA antes de P7b. Son tonos apagados en clave papel/tinta, sin fantasía en el pelo.
4. **Bracket en desktop de dos lados** (mitades que convergen a la final al centro) **en vez del árbol de un lado**. Recomiendo **sí**: mitad del alto, usa el ancho que hoy sobra; en el celu queda de un lado con scroll del árbol.
5. **"Cómo jugar": ¿hoja emergente o página propia?** Recomiendo **hoja** (no te saca de la home, se cierra con Esc o tocando afuera). Si después lo querés para la landing o para compartir, se agrega `/como-jugar` con el mismo contenido.
6. **Orden:** ¿te sirve que la limpieza y la T-pose (P2) vayan antes que el layout (G)? Recomiendo **sí**: la T-pose es un bug visible en prod y P2 es chico.
7. **Deps:** ¿la otra sesión terminó con `wip/deps-major`? Su TODO dice "listas", así que **asumo que sí** y lo mergeo en P1 desde este worktree, sin tocar sus ramas. Si sigue viva, P1 espera y lo demás avanza igual (solo cambia el rebase).

**Decisiones que tomé yo** (con default sensato; se pueden revertir):
- Ayuda con `<dialog>` nativo, sin dependencias.
- Paleta de pelo sin colores de fantasía.
- Tiempos en una función SQL inmutable más una constante TS con test de paridad, no en una tabla editable.
- Espera de sala por modo (`game_modes.lobby_seconds`).
- `eliminated_phase` al terminar el partido; premios sin cambios.
- Parser v2 escrito a mano sobre el catálogo, sin zod en runtime.
- Migraciones con el próximo número libre más un chequeo en CI.
- Sin silueta mientras carga el 3D (pedido explícito de Gino).
- En el penal, la pregunta no espera al 3D.

## Lo que no pude verificar (y cómo se confirma)

- **T-pose:** el mecanismo (bind = T-pose, pose solo por frame) está verificado; que el disparador sea `frameloop="demand"` + Suspense es hipótesis. Lo confirma el test de P2.2.1, que va antes del fix.
- **Pelo que corta la cabeza** y **cara frontal del zapato:** hipótesis por lectura de `glbShoes.ts` (loft sin tapas) y por cómo se prende el pelo del pack. Los confirman la galería y los chequeos de P7a, que van antes de cualquier fix.
- **Estado real de grants en prod:** no corrí la query de P1.4 (corrida solo de planificación). Va antes de aplicar la migración de deps.
