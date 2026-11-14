# TODO — TANDA ⚽

## 🛠 Feedback de Gino 14/11 — rama `feat/feedback-1411` (worktree `/mnt/hera/Proyectos/tanda-feedback`)
Plan: `~/.claude/plans/gino-prob-tanda-en-greedy-snail.md` (causas de fondo, no parches). Deploy **por fase**
(Gino revisa solo en prod): verde completo → rebase sobre main → merge → push → migraciones por MCP + ledger
→ smoke en prod → anotar acá. Decisiones: ELO ±300 <10 s / ±600 <20 s / cualquiera, oculto · K=32 fijo (sin
ubicación) · peinados curados del pack gratis (sin comprar Source) · migrar avatares con backup · premios por
competencia terminada (tabla `awards`).
- **Tests en paralelo con la otra sesión** (que usa el stack local `tanda` en 54321/54322 y el puerto 3101):
  stack propio con `SUPABASE_WORKDIR=<dir>` cuyo `supabase/config.toml` es copia con `project_id="tanda-fb"` y
  puertos +100 (migraciones = symlink). `SUPABASE_DB_URL=postgresql://postgres:postgres@127.0.0.1:54422/postgres
  pnpm test:db` · `SUPABASE_WORKDIR=<dir> E2E_FLOW_PORT=3201 pnpm test:e2e:flow`.
- **F0 ✅** línea de base → `docs/PERF-BASELINE.md`: funciones en **iad1**, DB en **sa-east-1**, JWT ES256, sin
  `loading.tsx`, proxy con `getUser()` en cada request.
- **F1 ✅** (`25199bc`) región `gru1` (`vercel.json`), `getSession()` con `getClaims` (proxy + páginas; lint prohíbe
  `auth.getUser()`), route groups `(app)`/`(game)`, `ScreenHeader` + mapa `lib/nav/routes.ts` (test), `loading.tsx`
  por grupo, footer solo en el sitio, `useNav()` (lint prohíbe `useRouter`), salir de sala/cancelar cola sin
  esperar el RPC, "Tabla" fuera de la cola. Reglas en `docs/DESIGN-RULES.md`.
- **F2 ✅** (`e350fd8`) migraciones `20261123000000_phase_close` (fase cierra cuando actuaron todos o al deadline,
  todos los modos) + `20261123000001_ranked_k32_window` (ventana ±300/±600 oculta, K=32 fijo, replay con backup
  `ranked_players_backup_1411`: prod esperado Rosario 1516 / chese890 1484). Tests `phase_close.test.ts` + propiedades.
- **F3 ✅** (`0bf6f74`) `/jugar` (partida rápida + ranked + crear sala + código; padre de sala y cola), home con
  JUGAR como única primaria (sin volanta, sin sello, sin Tabla/Salir), perfil con ficha de liga (posición + Ver
  tabla). Regla "una primaria por pantalla": `e2e/_primary.ts` (cuenta botones rojos, incluye hover pegado de touch).
- **F3b ✅** (`818f2b0`) migración `20261123000002_awards`: tabla `awards` unique por (usuario, competencia);
  constraint trigger diferido al pasar el torneo a `finished`; división final al cerrar temporada
  (`ranked_season_results`); backfill; `get_profile_stats` lee solo `awards` (+ `current` = temporada en juego;
  `divisions: []` queda por el front viejo → dropear en la próxima). Tests `awards.test.ts` (a–e + torneo real).
- **🚀 Deploy F1–F3b a prod (14/11 ~18:45, `a0288e8`, fast-forward de main):**
  - DB por MCP: `phase_close`, `ranked_k32_window`, `awards` → ledger reconciliado a `20261123000000/01/02`
    (renumeradas: `20261122000000` es de `wip/deps-major`). Replay ranked: Rosario 1532→**1516**, chese890
    1468→**1484** (backup `ranked_players_backup_1411`, 2 filas). Backfill awards = 0 (ningún humano pasó de
    grupos; los "3 logros" eran las divisiones derivadas). `get_advisors`: solo lo esperado por diseño.
  - Vercel: funciones en **gru1** (`x-vercel-id: gru1::gru1`). Smoke prod 26/26 (axe + CSP) + invitado →
    /jugar → Mundial → partido → penal: 0 errores de consola, 0 violaciones CSP; el penal cerró 6,7 s después
    de responder (cuando actuó el bot), no a los 10 s.
- **CI de `e2e-flow` vuelve a verde** (en main fallaban `game` y `ranked` desde el deploy de CSP): la escena del
  penal corría a 60 fps a pantalla completa durante la pregunta y con WebGL por software los taps no se
  procesaban. Ahora se pinta a demanda mientras se responde y anima solo la jugada (`PenalScene` `frameloop`).
- **F4 ✅ en rama, SIN deployar** (`c64849e`, push a `feat/feedback-1411`, PR draft #2): cliente de Supabase
  bajo demanda fuera del juego (`lib/supabase/lazy.ts`, lint lo exige) → landing/login/registro/perfil/jugar
  ~220→~155 KB gz; precarga del 3D (chunk + GLB) mientras se espera en sala/cola/torneo (`usePreload3D`);
  `pnpm perf:budget` en CI (`scripts/perf/budget.{ts,json}`, falla si three entra en una ruta). Verde local:
  unit 156, smoke 24/24, flow 6/6. CI del commit estaba corriendo al cortar (usage-guard 91%).
- **▶ Handoff (cortado por usage, 14/11):**
  1. `gh run list --branch feat/feedback-1411 --limit 1` → si CI de `c64849e` (o del commit de este TODO) está
     verde: `git fetch && git merge-base --is-ancestor origin/main HEAD && git push origin HEAD:main` (F4 no
     tiene migraciones). Esperar deploy, smoke prod `E2E_BASE_URL=https://tanda2026.com.ar pnpm exec playwright
     test` + invitado → partida (consola/CSP), medir TTFB p50 vs F0 en `docs/PERF-BASELINE.md`, anotar acá.
  2. **F5 (avatar)** sin arrancar código, solo relevado: pack gratis Standard trae además `Hair_Beard`,
     `Eyebrows_Regular/Female` y texturas de piel Light (bajado en el scratchpad, se re-baja igual que en 6b).
     Consumidores de la forma v1: `lib/avatar/*`, `components/avatar/*`, `lib/penal/scene.ts`,
     `lib/realtime/penal.ts`, `lib/ranked/types.ts`, `lib/guest/anon.ts`, `database.types.ts`, SQL
     `participant_brief` (`avatar #>> '{top,color}'`) y default `'{}'`. Plan en sección C del plan file;
     migración SQL futura `20261123000003_avatar_v2` (verificar número libre vs otras ramas). Orden: front
     que lee v1+v2 primero, después la migración con backup `profiles_avatar_backup`.
  3. **Pedido de Gino (14/11, va en F5 o antes):** al abrir penal/creador aparece primero el muñeco procedural
     viejo (`AvatarModel`) y después el GLB → **borrar `AvatarModel` por completo** (y sus tests/usos en
     `GlbAvatar`, `PenalScene`, `AvatarCanvas`, `/dev/*`), precargar el GLB antes de mostrar la escena
     (Suspense con `preloadGlbBodies`), mientras carga un **placeholder neutro** (skeleton/loader, nunca otro
     muñeco) y si el GLB falla un **estado de error claro** (error boundary). Sumar pasada de **código muerto/
     legado**: knip, componentes, assets sin uso, compat temporales (`divisions: []` en `get_profile_stats` +
     tipo, `placement_left` de `ranked_players` → migración de limpieza; actualizar CLAUDE.md que menciona
     `AvatarModel` como fallback). Deploy a prod como las demás fases.

## 🚀 Deploy a prod (14/11, pedido por Gino) — main = `wip/csp-enforce` (fast-forward)
Entra todo: avatar-glb, ideas-avatar, post-6b, ideas-questions, e2e-flow, ideas-e2e, fix-guest,
fix-modes-flake (vía `wip/integration`) + **CSP enforced** (0 violaciones verificadas). DB de prod ya
tenía `…18…`–`…21…` (ver abajo); los 5 avatares guardados en prod siguen siendo válidos con las piezas
nuevas. Verde sobre main: typecheck · lint · knip · 150 unit · build · 78 db · flow game/guest/ranked ·
smoke 14 (champion ✓ sobre el mismo árbol en csp-enforce).
**NO entra:** deps mayores → rama `wip/deps-major` (solo el paso three/@types/three 0.187, verde salvo 1
flake de ranked que pasó al repetir; falta cerrarlo). Pendientes ahí: @supabase/ssr 0.12, vitest 5,
eslint 10, supabase CLI 3, TS 6.0 (TS 7 inviable hoy: typescript-eslint 8.72 pide `typescript <6.1.0` y
TS 7 no trae la API programática; esperar TS 7.1), @types/node se queda en 24 (= runtime de Vercel).
**✅ En prod** (deploy `dpl_8yucG41yUmkpMcLigbtqW54dTn89`, commit `b21c1c1`): la CSP enforced se sirve con
`connect-src` limitado al proyecto de Supabase. Smoke en prod (un invitado): landing, login, registro,
ranking, home, /avatar, /perfil y partido (sala → penal → ATAJADO, escena 3D con `avatar-male.glb` 200)
→ 0 violaciones CSP, 0 errores de consola, 0 HTTP ≥400; Vercel runtime errors: ninguno. Falta que Gino
mire los muñecos con una cuenta registrada (el creador de avatar con GLB no lo probé con usuario real).

## 🔒 CSP enforced (14/11, OK de Gino) — rama `wip/csp-enforce` (sobre `wip/integration`), SIN deployar
`wip/integration` = `wip/fix-modes-flake` (⊃ fix-guest ⊃ ideas-e2e ⊃ e2e-flow) + `wip/ideas-avatar`
(⊃ avatar-glb) + `wip/ideas-questions` (⊃ post-6b): mergean limpio, verde completo (typecheck · lint ·
knip · 150 unit · build · 78 db · 14 e2e). La CSP se validó contra eso, porque los GLB/meshopt viven ahí.
- **Reportes:** no había `report-uri` → se juntaron de la consola (listener de `securitypolicyviolation`)
  recorriendo landing, login, registro, ranking, invitado, avatar, perfil y un partido con escena 3D:
  prod (código de main) 0; integración en local → `connect-src` a Supabase local (esperable) y
  **`connect-src blob:`**: GLTFLoader pide por fetch las texturas embebidas de los GLB → enforced sin
  `blob:` los muñecos se quedaban sin texturas.
- **Cambio (`next.config.ts`):** `Content-Security-Policy` enforced (sale el Report-Only).
  `connect-src 'self' blob:` + el origen de `NEXT_PUBLIC_SUPABASE_URL` (https + wss; ya no `*.supabase.co`,
  y el e2e local funciona); `script-src` suma `'wasm-unsafe-eval'` (decoder meshopt) y `'unsafe-eval'`
  solo en `next dev`. Resto igual (`'unsafe-inline'` sin nonce: un nonce forzaría render dinámico en todo).
- **Fijado en tests:** `e2e/_csp.ts` (fixture auto) hace fallar cualquier test con una violación; lo usan
  smoke y los 4 flow (ranked con `watchCsp` en sus 2 contextos). Probado con un canario que viola a
  propósito → falla con `enforce img-src`.
- **Corridas:** flow completo con CSP enforced: campeón 11,2 min · game 1,4 · guest · ranked 2,5 ✓ y 0
  violaciones; smoke 14 ✓. `/dev/avatar`, `/dev/penal`, `/dev/kit` (next dev): 0 violaciones, GLB 200 y
  render OK. Build de prod: partido con el arquero GLB texturizado, `WebAssembly.compile` permitido, 0
  violaciones.
- **Ojo al deployar:** los previews de Vercel inyectan el toolbar de `vercel.live` → bloqueado por la CSP
  en previews (prod no lo usa). Si se quiere el toolbar en previews, sumar `https://vercel.live` solo
  cuando `VERCEL_ENV=preview`. `NEXT_PUBLIC_SUPABASE_URL` tiene que estar en el build (ya lo está).

## ✅ DB de prod al día (14/11, con OK de Gino) — migraciones `…18…`–`…21…` aplicadas; código SIN deployar
- **Grants de prod (idea 1):** prod tenía `SELECT/INSERT/UPDATE/DELETE` para `anon` **y** `authenticated`
  sobre TODAS las tablas de juego (`penalties`, `questions`, `matches`…), y el default ACL de `postgres`
  seguía dando `arwdDxtm` a las tablas nuevas. RLS sin policy las bloqueaba, pero el grant no.
  → `20261119000000_explicit_table_grants` ahora hace `revoke all` en todas las tablas de `public` +
  `alter default privileges … revoke all on tables` y re-otorga solo la allowlist del test (d) (commit
  `6a3210e`, **solo en `wip/fix-guest`**: `wip/e2e-flow`/`wip/ideas-e2e` tienen la versión vieja; al
  mergear en orden queda la nueva). Verificado en prod: grants == allowlist; REST anon a
  `questions/profiles/penalties` → 401, `game_modes` → 200. Antes chequeé que el código de main solo lee
  `profiles/rooms/game_modes` y actualiza `profiles(username|avatar)`, que no hay `postgres_changes` y
  que las funciones invoker solo corren dentro de RPC definer.
- **`…20…` (build_knockout):** aplicada; cuerpo idéntico al local (hash sin comentarios), ACL intacto.
- **`…18…` + `…21…` (catálogo):** 21 es el mismo seed upsert regenerado y reemplaza a 18 → se aplicó un
  delta de las 454 filas que cambian (difficulty 129 · topic 341 · prompt/options ~100; 0 `correct_index`
  cambiados, 0 filas nuevas). Hash del catálogo de prod == estado post-21 local (`d4a890d8…`). En el ledger
  `…18…` figura como subsumida por `…21…`.
- **Ledger reconciliado:** `…18… questions_matches`, `…19…`, `…20…`, `…21…` con los nombres del repo.
- **Advisors:** iguales a antes (lo esperado por diseño: RLS sin policy en tablas de juego, RPC del
  cliente ejecutables por `authenticated`, `username_available` por anon, anon sign-ins, leaked password).
- **Smoke en prod (un invitado, como cualquier visita):** Mundial/Fútbol argentino habilitados, `/avatar`,
  `/perfil`, `/ranking` 200; partido real: sala → partido (74 s) → penal (ya con una pregunta editada) →
  respuesta → ATAJADO; 0 errores de página, 0 HTTP ≥400, 0 `correct_index` filtrado. El invitado quedó
  en el torneo como desconectado (respuestas aleatorias hasta el final, como cualquier visita).
- **Ojo:** el catálogo de prod va adelantado a `data/` de main hasta mergear `wip/post-6b` +
  `wip/ideas-questions`; no regenerar ni aplicar seeds desde main antes de eso.
- **Flake "Próximamente"** (rama `wip/fix-modes-flake`, sobre `wip/fix-guest`): 1 de 4 corridas de `game`
  renderizó los modos deshabilitados. No se reprodujo en 49 corridas más (guest ×30 en caliente, ×15 con
  server en frío, game ×4 en frío). En la falla `get_ranked_me` sí respondió → no era el PGRST303 (pega a
  las 4 queries juntas). Endurecido sin adivinar: la home loguea el error de cada una de sus 4 queries
  (`[home] <query> <code> <msg>` → logs de Vercel/e2e) y, si `game_modes` falla, ofrece los modos del
  registro (el server igual rechaza un modo inactivo en create_room/quick_play). `guest.spec` ahora exige
  Mundial y Fútbol argentino habilitados. Si vuelve a pasar, el log dice qué fue.

## 🧾 Resumen final de la tanda autónoma (14/11) — todo en ramas `wip/`, NADA en main/prod
Ramas (todas sobre main, sin push). Orden de merge sugerido y qué trae cada una:
1. `wip/avatar-glb` — Fase 6b (personajes GLB, cresta, botines).
2. `wip/ideas-avatar` (sobre 1) — precarga de los dos GLB en el creador + **error boundary**: si un GLB
   no carga, queda el avatar procedural en vez de caerse el canvas (pasaba en creador y penal).
3. `wip/post-6b` — micro-labels 12px, 100 preguntas nuevas verificadas. Migración `…18…`.
4. `wip/ideas-questions` (sobre 3) — filtraciones lejanas en temas + pirámide de dificultad wc.
   Migración `…21…` (después de la `…18…`). Revisar las 50 recalibraciones de dificultad.
5. `wip/e2e-flow` — e2e invitado→sala→partido contra Supabase local + grants explícitos. Migración `…19…` (ya en prod)
   (**antes, mirar los grants reales de prod**: idea 1, query más abajo).
6. `wip/ideas-e2e` (sobre 5) — fix de 16avos mismo grupo (bug real en prod, ~2% de torneos; migración
   `…20…`), e2e ranked, e2e campeón (`E2E_SLOW=1`), job de CI `e2e-flow` (sin probar en GitHub).
7. `wip/fix-guest` (sobre 6) — **bug "Entrando…" del invitado (puede pegar en prod)**: 401 PGRST303
   transitorio → el home caía al landing con el botón colgado. Fix en 3 capas (home decide por `user`,
   reintento de PGRST303, `GuestButton` en transición y sin crear un 2º invitado). Si se quiere antes que
   el resto: los cambios de `app/page.tsx`, `components/lobby/GuestButton.tsx` y `lib/supabase/*` no
   dependen de 5/6 (cherry-pick de `a00ef87` + `daa9b31`, sin `e2e/flow/guest.spec.ts`).
Verde en cada rama (typecheck · lint · knip · unit · build); test:db en las que tocan SQL; e2e de flujo
completo ✓ (game 1,5 min · ranked 2,9 min · campeón 11,2 min · invitado ×20). Code review medium de las
ideas-* + fix-guest: 9 hallazgos, 8 arreglados; el de reordenar `questions:check` era al revés (lo medí:
0,54 s → 1,45 s) y quedó documentado. Para Gino: aprobar migraciones `…18…`–`…21…` en prod, idea 1
(grants de prod), 9 (CSP enforcing) y 10 (deps mayores).

## Estado: TANDA 2.0 en curso — Fases 0, 1, 2, 3, 4 y 4b HECHAS (rebrand + Modo Argentina + Ranked en prod)

Plan completo: `~/.claude/plans/que-onda-arme-esta-typed-pebble.md` (fases 0–7). Deploy directo
a main por fase. Decisiones de Gino en la memoria `tanda-2-0-decisiones`.

> **Verde local completo:** `typecheck · lint · knip · build · 132 unit · 74 db` (incluye e2e AR + ranked).
> **DB de prod:** hasta `20261115000000_ranked` aplicada por MCP, ledger reconciliado, cron
> `tanda-ranked` (2s) activo, advisors = lo esperado por diseño.

## ⏸ Post-6b — rama `wip/post-6b` (desde main, 14/11), falta revisión + merge + deploy

Independiente de `wip/avatar-glb` (se mergean por separado). Verde: `typecheck · lint · knip · build ·
145 unit · 76 db`.
- **Micro-rótulos 10px → 12px** (`text-xs`) donde entran: perfil (divisiones/copas), bracket (fases, Pts),
  ranked (Si ganás/Si perdés, rangos de la cola), ranking (línea secundaria, tracking 0.04em). Queda en
  10px el rótulo central del HUD del penal ("PENAL 3 DE 5" no entra a 12px en 375px). Revisado en
  `/dev/kit` a 375px.
- **100 "¿De qué país es X?" → partidos y finales 1930–2022** (`data/questions/worldcup.json`, mismas keys;
  quedan 27 icónicas/curiosas). `players_records` 37% → 23%. Sin hechos de 2026. `questions:check` ✓;
  ⚠ pirámide: easy 182 < medium 225 (las que salieron eran casi todas fáciles; la dificultad solo ordena
  preferencias con fallback, no rompe nada). Migración `20261118000000_questions_matches` (sync generado).

- **Verificación contra fuentes (14/11, WebSearch):** chequeadas las 100 (resultado, año, sede,
  goleadores). Todas correctas; solo se reescribió **wc-507** (redacción ambigua → "¿Contra qué selección le
  anularon un gol a Francia en 1982…" → Kuwait). Hechos menos obvios confirmados con fuente: dos pelotas en
  la final 1930; Garrincha expulsado y habilitado 1962; Sanon cortó los 1.142' de Zoff (1974); hat-trick
  de László Kiss en 7' (1982); jeque de Kuwait (1982); Núremberg 2006 (4 rojas/16 amarillas); Suiza 2006
  sin goles en contra; 16 atajadas de Howard (2014); México 7 octavos seguidos (1994–2018); España 1-0 en
  todo el mata-mata 2010; Mbappé 2 goles en 97" (2022); Molina–Messi vs Países Bajos (2022); Zúñiga–Neymar
  (2014); panenka de Abreu (2010). De paso se confirmaron con múltiples fuentes **wc-504** (España 1-0
  Argentina, Ferran Torres 106'), **wc-621** (Inglaterra 3ª, 6-4 a Francia) y **wc-622** (Paraguay 4-3 por
  penales a Alemania, 16avos) → ya no hace falta que Gino las confirme.

- **Code review (/code-review high, 14/11)** — arreglado:
  - **Filtraciones** (una pregunta regala la respuesta de otra del mismo Mundial con poco texto en común,
    que `questions:check` no veía): reescritas wc-328/354/369/509/516/518/546/547/548/561/572/606/609/610/
    612/619 (mismo hecho, mismas opciones salvo wc-606) y sacados los "(Argentina-Alemania Federal)" de las
    finales wc-141/289/290/632 (regalaban wc-624/625 y las subcampeonas). **wc-614** reemplazada (filtraba
    wc-698): "¿Qué selección le ganó al anfitrión en el inaugural de 2022?" → Ecuador.
  - `questions:check` reporta "posibles filtraciones (mismo año, otro tema)" (informativo; detalle con
    `--leaks`): no entran a los temas porque encadenadas arman grupos de 100+ preguntas. Quedan ~350 en
    wc, casi todas débiles ("Argentina jugó en 2022" vs "¿quién ganó 2022?").
  - Fix: `questions:topics` reescribía el JSON con indent 4 (tomaba la sangría de las claves).
  - `stats-2026-11.csv`: fuera las 10 filas de keys reutilizadas (sus aciertos eran de la pregunta vieja).
  - **Decisión a revisar con Gino:** se reutilizaron las 100 keys (upsert) en vez de retirarlas y crear
    nuevas. La UI no muestra preguntas de partidos pasados (solo el penal en vivo; la respuesta correcta
    mantiene su índice), así que el historial de prod no se ve afectado; si se quiere trazabilidad
    estricta, pasar a keys nuevas + migración de retiro.
  - ⚠ Pirámide: easy 182 < medium 225 (sin cambio; `take_tournament_question` cae a la dificultad vecina).
  - Micro-rótulos: "LIBERTADORES" desbordaba su columna en /perfil a 360px (99px en 98,7) → sin tracking
    hasta 400px y 11px por debajo de 360px (medido: entra en 320/360/375/430). Ranking: `truncate` en la
    línea secundaria (antes podía partirse en 2 líneas).
  - `test:db`: 1 flake en `tournament_e2e` en la primera corrida post-reset; 76/76 en las dos siguientes.

- **Rama `wip/ideas-questions` (sobre post-6b, idea 6 del TODO):** `questions:check` ahora agrupa en el
  mismo tema las filtraciones de las 600 viejas que no se parecían en el texto: comparten año + ≥10% de
  contexto aparte de la respuesta, con "ganó/perdió/campeón/final…" como un mismo concepto, y "…en Chile"
  ↔ "¿qué país organizó?" (ej.: "¿Qué DT llevó a Estudiantes a ganar la Copa de la Liga 2024?" ↔ "¿Qué club
  la ganó?", "perdió la final 2018 ante Francia" ↔ "¿quién fue campeón 2018?"). Temas: wc 61 grupos/275
  preguntas, arg 59/301 (el más grande, 106 de River/Boca: inofensivo, el tema solo ordena preferencias y
  un torneo usa ~15 preguntas). Quedan 169 wc / 14 arg "posibles" débiles (`--leaks`). Migración de sync
  `20261121000000_question_topics_leaks` (local ✓; prod con OK de Gino, después de la `…18…`).
  **Idea 5 (misma rama):** pirámide de dificultad wc arreglada → easy 215 · medium 212 · hard 188 · very_hard
  85 (antes 182/225/208/85, hard ≥ medium rompía la pirámide). 34 → easy (30 medium muy conocidas + Gol del
  Siglo, Messi 5 mundiales, Argentina 1978, triplete de Mbappé), 16 hard → medium (Klose, CR7, Casillas,
  mano de Suárez…). Va en la misma migración de sync `…21…` (regenerada). Revisar el criterio con Gino.

**Para deployar (con OK de Gino):** `git checkout main && git merge wip/post-6b && git push` (front) +
aplicar `20261118000000_questions_matches` por MCP `apply_migration` (es un sync de ~250 KB: en la 5b se
aplicó como diff compacto — basta con los upserts de las 100 keys cambiadas) + reconciliar ledger.

### Hecho
- **Fase 0** — footer "Gino Giorgi" → página de creador; favicon real (svg/ico/apple/PWA).
- **Fase 1** — deps al día; wipe total de prod (0 usuarios); squash a baseline v2; catálogo
  versionado en `data/` (zod + `pnpm catalog:check` / `pnpm catalog:build <ts_nombre>`); revoke
  de helpers a anon; stats de acierto previos al wipe en `data/questions/stats-2026-11.csv`.
- **Fase 3** — modos:
  - DB: `game_modes` (formato por modo), `nations`→`teams` (mode_id, short_name, crest_asset,
    kit_pattern, kit_tertiary, strength_rank), `mode_id` en rooms/tournaments/questions,
    `create_room(p_mode)`/`quick_play(p_mode)`, `start_tournament`/standings/`build_knockout`/
    `advance_ko_round` genéricos (zonas impares → interzonal de los libres; AR: 1A–8B… octavos,
    sin 3er puesto, desempate pts→penales→moneda). Motor TS `lib/engine/formats.ts` + paridad.
  - Front: registro `lib/modes` (labels de fase/zona unificados), `TeamMark` (bandera o escudo),
    `TeamReveal`, bracket/resumen/historial por modo, selector de modo en Jugar/Crear sala
    (modos inactivos = "Próximamente"), lobby muestra modo y cupo.
  - Tests: `supabase/tests/tournament_arg_e2e.test.ts` (30 → zonas → octavos → campeón).

- **Fase 4** — Modo Argentina **activo en prod**: 30 escudos originales `public/crests/arg/*.svg`
  (generador `scripts/crests/build_crests.py <BigShouldersDisplay-Black.ttf>`), 700 preguntas
  `data/questions/arg.json` (269/184/165/82), migración `20261114000002_seed_arg_questions`
  (aplicada por MCP en 4 tandas de datos + activación; ledger reconciliado).

## ⏸ Fase 6b: personajes GLB de Quaternius — HECHA en la rama `wip/avatar-glb` (14/11), falta merge

Verde local (14/11, tras el corte): `typecheck · lint · knip · build · 145 unit`. Revisado con screenshots headless en
`/dev/penal` (idle, patada, estirada, festejo, banda diagonal) y en la galería nueva `/dev/avatar`.

- `scripts/avatar/build-glb.mts` (`pnpm avatar:build <dir>`): cuerpo M/F + 5 peinados en el mismo skin,
  meshopt → `public/models/avatar/avatar-{male,female}.glb` (~700 KB c/u). **Sin animaciones de UAL**
  (se borró `avatar-anims.glb` de 3 MB): el rig propio anima los huesos.
- `components/avatar/GlbAvatar.tsx`: carga el GLB (meshopt), elige y tiñe el peinado según `hair.part`,
  y pinta la ropa en el shader **por fragmento con planos sobre la posición de bind normalizada (T-pose)**:
  tobillo 0.10, dobladillo del short 0.66, cintura 1.02 (planos en y) y manga = plano en |x| (por cuerpo:
  musculosa 0.215/0.165, remera 0.32/0.28, manga larga 0.705/0.66) → cortes rectos (antes, one-hot por
  vértice = zigzag). Cabeza/cuello = piel por hueso. Corte de ropa y colores van por uniforms (cambiar
  remera/short no reclona). Banda diagonal `kitSash`. Normal map del "superhéroe" a 0.3.
- `components/avatar/glbRig.ts`: retarget `deseado = D·C·Wbind`, `local = padre⁻¹·deseado` (C = bajar
  brazos de la T-pose, 1.38 rad). `GlbAvatar` registra pivotes fantasma → `applyPose`/`useRig` sin cambios.
- `components/avatar/Avatar3D.tsx`: GLB dentro de un `<Suspense>` con el `AvatarModel` procedural de
  fallback mientras carga. Ya está usado en `AvatarCanvas` (creador/perfil) y `PenalScene`.
- CSP: `'wasm-unsafe-eval'` (decoder meshopt; hoy la CSP es Report-Only).

**Sesión 14/11 (post corte de luz):** `git fsck` OK (solo dangling viejos de junio), GLB íntegros
(header glTF = tamaño real, chunks JSON+BIN completos, 673/728 KB, cargan 200 en el navegador), `.next` y
`tsbuildinfo` regenerados. Verde: `typecheck · lint · knip · build · 145 unit`. Arreglado: cortes de ropa
en zigzag (ver arriba) y warning `toNonIndexed` de la pelota. Revisado headless: galería `/dev/avatar` y
penal (idle, SAVE 2, GOAL 1) sin errores de consola. Nota: en este shell `pnpm` vive en `~/.npm-global/bin`.

**Próximo paso:** que Gino mire `/dev/avatar` y `/dev/penal` (`pnpm dev`) → `git checkout main && git merge
wip/avatar-glb && git push` (deploy). El `AvatarModel` procedural queda solo como fallback.
- **Rama `wip/ideas-avatar` (sobre avatar-glb, idea 7):** el creador precarga los dos GLB y arma sus
  templates de antemano (`WarmGlbBodies` en `AvatarCanvas`, Suspense propio sin fallback) → cambiar de
  cuerpo ya no cae al avatar procedural ni paga `templateOf` en el tap. Medido headless (390×844 @2x,
  dev mode, SwiftShader): `templateOf` 10–22 ms a CPU 1× y **40–53 ms a CPU 4×** (~Android gama media),
  `instantiate` por avatar 1–6 ms, sin long tasks; GLB 673/728 KB (~0,6 s c/u en 4G). Gotcha: `useLoader`
  con array es OTRA clave de caché que con un URL → parseaba dos veces; va un `useLoader` por URL. Falta
  medir en un teléfono real (shader + primer frame con GPU de verdad). Code review: `ErrorFallback`
  (error boundary) en la precarga (si falla el GLB del otro cuerpo, se ignora) y en `Avatar3D` (si
  falla el GLB visible, queda el procedural en vez de caerse el canvas — pasaba ANTES de esta rama, en
  el creador y en el penal). Probado con el GLB femenino bloqueado: 8/8 canvas de `/dev/avatar` vivos.
- ✅ **Cresta del mohicano** (`components/avatar/glbCrest.ts`, 14/11): 7 púas low-poly generadas sobre el
  perfil sagital del rapado del cuerpo, colgadas del hueso `Head`, teñidas con el pelo. Fix: el rapado
  de hombre flotaba sobre la cabeza de la mujer (ahora cada cuerpo usa el suyo). Galería: mujer con
  mohicano + hombre en 3/4 de perfil.
- ✅ **Botines con forma** (`components/avatar/glbShoes.ts`, 14/11): loft superelíptico medido sobre el pie
  en reposo + suela que contrasta, skinneado a `foot_*`/`ball_*`; zapatillas (suela gruesa clara) /
  botines (fina) / tapones (fina + 6 tapones). El shader del cuerpo descarta el pie descalzo (y<0.085).
  Revisado en la galería y en la patada del penal.
- ✅ **Code review (/code-review high, 14/11)** — arreglado:
  - Rig congelado tras re-suspender (cambio de cuerpo sin GLB en caché): el registro de pivotes pasó a
    `useLayoutEffect` (React lo re-ejecuta al revelar el Suspense, después de que el fallback borra los suyos).
  - Con `prefers-reduced-motion` (frameloop "demand") los cambios de color/corte/pelo/botines no se
    dibujaban: ahora se aplican en un layout effect + `invalidate()` (antes se pisaban los uniforms cada frame).
  - Lag de un frame: `applyPose` de `AvatarCanvas`/`PenalScene` va con prioridad -1 → corre antes que el
    `useFrame` de `GlbAvatar` que lo traduce a huesos.
  - Pérdida de memoria y CPU: la preparación pesada (geometría del cuerpo, cresta, botines) se hace una vez
    por GLB (`templateOf`, WeakMap); cada instancia clona y crea solo sus materiales, que libera al desmontar.
    Un esqueleto por pie (no por variante); `dominantBone()` compartido; sin regex por vértice.
  - `footSlices` rellena huecos con la vecina más cercana con datos (antes podía perder secciones).
  - `build-glb`: valida que bind (inversas) y nodo del pelo coincidan con el cuerpo y borra el temp
    (⚠ no corrido: los packs fuente no están en disco; solo typecheck).
  - Docs: CLAUDE.md / SPEC §8.2 / `parts.ts` decían "sin GLBs externos" → reflejan la decisión GLB.
  Revisado headless: galería y penal, normal y reduced motion, sin errores de consola.
Los zips fuente ya no están; para rebajarlos sin cuenta: `curl` a `https://quaternius.itch.io/<slug>`,
sacar `csrf_token`, `POST <slug>/file/<upload_id>?source=view_game&as_props=1` → JSON con `url` firmada
(universal-base-characters 15861669).

**Después de 6b:** ✅ hecho en la rama aparte **`wip/post-6b`** (desde main, se mergea por separado):
micro-rótulos 10px→12px y 100 "¿De qué país es X?" → partidos/finales (+ migración
`20261118000000_questions_matches`). Detalle y pasos de deploy en el `TODO.md` de esa rama.

---

### Pendiente de revisión con Gino (al FINAL del proyecto, decisión suya)
- Preguntas: la verificación dato por dato ya se hizo (Fase 5b). Queda para Gino una pasada de
  gusto/tono. Las 100 nuevas de partidos/finales (post-6b) ya están verificadas contra fuentes (ver
  sección post-6b); queda solo la pasada de gusto.
- Datos del Mundial 2026 tomados de Wikipedia/ESPN (jul 2026): España campeón 1-0 a Argentina en el
  alargue (Ferran Torres), Mbappé Bota de Oro (10) y máximo goleador histórico (22), Messi 21,
  Kane 14, Deschamps 27 partidos como DT, 308 goles, Paraguay eliminó a Alemania por penales,
  Inglaterra 3ª. wc-621/622/504 reconfirmadas con varias fuentes (14/11).
- `kit_pattern` aproximados de `data/teams/arg.json` y look de escudos.
- **3D con GLB (Fase 6 del plan)**: no bajé assets ni instalé Blender (descargar requiere tu OK
  explícito). Se hizo la Fase 6 **solo con código** (rig propio articulado, ver abajo). Recomendación:
  si querés más calidad de personaje, aprobar bajar Quaternius *Universal Base Characters* +
  *Universal Animation Library* (CC0, mismo rig) e instalar `blender` para el pipeline headless; el
  sistema de clips/escena de `lib/avatar/rig.ts` + `lib/penal/shot.ts` se mantiene y solo cambia el
  modelo. Con el rig actual el resultado ya es presentable (ver `/dev/penal`).
- La escena 3D ahora corre en loop continuo (idle animado) salvo `prefers-reduced-motion`; antes era
  on-demand. Si en mobile gama baja se nota la batería/calor, volver a "demand" en idle.
- ⚠️ **GOD y TSU son provisorios** (ascensos 2027: final Primera Nacional 14–15/11 + Reducido)
  → migración chica de `teams` + regenerar escudos cuando se definan.

- **Fase 2** — rebrand "B · Programa" **en prod**: tokens papel/tinta/rojo/azul, Big Shoulders + Instrument
  Sans, primitivas con borde de tinta y sombra offset, `Wordmark` con sello, landing/auth/jugar/penal/HUD/
  bracket/resultados/perfil/avatar/404/error, ícono + OG nuevos, kit visual `/dev/kit`, `CLAUDE.md` con
  reglas de marca. Pendiente menor: escena 3D sigue oscura (se rehace en Fase 6).

- **Fase 4b** — **Ranked 1v1 en prod**:
  - Motor `lib/engine/ranked.ts` (Elo K64 ubicación/K32, piso ±4, divisiones Potrero→Leyenda, escudo
    de 3 derrotas, reset de temporada, dificultad por nivel) + port SQL con paridad.
  - DB `20261115000000_ranked`: `ranked_{seasons,players,season_results,queue,matches}` (RLS sin
    policies, todo por RPC), cola `ranked_enqueue/poll/cancel` (lock advisory, ventana ±100→±250→todos
    a los 10/20s, latido 8s, purga 15s) + backstop `ranked_tick` por pg_cron. Partido = torneo
    `ranked` (game_modes inactivo → no entra por quick_play) con 1 match `final`; settle idempotente
    por trigger al terminar; abandonar = forfeit inmediato; preguntas de todos los bancos activos.
    También versiona el trigger `on_auth_user_created` (estaba solo en prod).
  - Front: card Ranked en Jugar, `/ranked` (cola), `/partido` → `RankedLive` (cara a cara con
    "si ganás/si perdés", tanda, resultado con Δ/ascenso/escudo/"Otra ranked"), `/ranking` (top 50 +
    tu puesto), botón Tabla en el home, perfil con 3 filas (divisiones + copas Mundial/AR).
  - Escudos de división y copas: `scripts/brand/build_divisions.py` → `public/crests/div/`, `public/cups/`.
  - Tests: `lib/engine/ranked.test.ts`, `supabase/tests/ranked.test.ts`.
  - **Falta probar con 2 personas reales en prod** (Gino + JM10): cola → partido → puntos.

- **Fase 5** — **variedad de preguntas en prod**:
  - `pnpm questions:check` (en CI): casi-duplicados (Jaccard + misma respuesta), "filtraciones" (una
    pregunta nombra la respuesta de otra), balance de categorías/posición/pirámide. Pares revisados a
    mano (misma plantilla, otro dato) en `data/questions/reviewed-pairs.json`.
  - Mundial: 21 duplicados reales reemplazados por preguntas nuevas (batacazos, sedes, trivia); la
    correcta estaba sesgada de posición → rebalanceada a ~33/33/33 (`md5(key)%3`).
  - `topic` = grupo de mismo hecho/plantilla (`pnpm questions:topics`, 54 grupos WC + 61 AR). DB
    `20261115000001_question_topics`: `take_tournament_question` prefiere tema no usado en el torneo y
    categoría distinta de la última (`tournament_questions.taken_at`). Test `question_variety.test.ts`.
  - Seed `20261115000002_questions_dedupe` (en prod se aplicó como diff compacto; hash del catálogo
    verificado igual a local).
  - Pendiente (va con 5b): recalibrar dificultad con `stats-2026-11` y bajar `players_records` (38% WC).

- **Fase 5b** — **datos de las 1400 preguntas verificados** (en prod, `20261116000000_questions_verify`):
  - Mundial: 15 preguntas que el Mundial 2026 dejó viejas (España "único título", Klose/Fontaine/
    Lineker/Schön como récords, Messi y CR7 "cinco Mundiales", Alemania "nunca perdió por penales",
    récords de goles/autogoles, finales de Argentina) corregidas; 7 "¿De qué país es X?" → resultados
    del Mundial 2026; 11 duplicados semánticos que `questions:check` no detectaba (mismo hecho con
    otra redacción, varios de la Fase 5) reemplazados por hechos nuevos.
  - AR: las 700 revisadas, sin errores (ascensos 2024/25 confirmados con fuente).
  - Dificultad: 3 ajustes con `stats-2026-11` (muestra chica, n≤6; el resto sin señal).

- **Fase 6** — **3D nuevo, sin GLBs (código propio)**:
  - Rig `lib/avatar/rig.ts` (TS puro, testeado): 11 articulaciones, poses, clips por keyframes
    (IDLE, KICK, CELEBRATE, DEJECTED, KEEPER_READY/DIVE/CELEBRATE), espejo L↔R y `sequencePose`
    (acción → reacción con crossfade).
  - `AvatarModel` articulado con pivotes (`components/avatar/rigPose.ts`: `useRig`/`applyPose`);
    pose de descanso idéntica a la anterior. Creador: luz de estudio, sombra de contacto, respiración.
  - Escena (`PenalScene` + `Stadium`): estadio de día (césped a franjas, líneas del área, red, carteles
    con colores de marca, tribuna con ~600 hinchas en 3 mallas fusionadas con los colores de los dos
    equipos), carrera + patada, estirada direccional, pelota con trayectoria determinista
    (`lib/penal/shot.ts`, testeado), red que se comba, público que salta, cámara que acompaña y
    termina en el protagonista. Reduced motion → pose final estática.
  - Banco de pruebas `/dev/penal?shot=goal-1&t=0.3` (404 en prod).

- **Fase 7** — **cierre**: Lighthouse mobile en prod 98/100/96/100, Playwright + axe
  (`pnpm test:e2e`, 14 verdes), texto mínimo 12px, índices de FKs (`20261117000000_fk_indexes`, en
  prod), advisors revisados, SPEC §0 / BRIEF / CLAUDE.md al día. Informe: `docs/AUDIT-2026-11.md`.

### Próximo
- **Plan Tanda 2.0 completo.** Queda: la prueba de Ranked con 2 personas reales, la revisión final con
  Gino (sección de arriba) y los pendientes de `docs/AUDIT-2026-11.md`.

---

## Estado anterior: 4 fixes (fondo mobile, cartel de penal, timing de grupos, cuestionario) — HECHO

Cuarta tanda de pedidos de Gino: pulido de UI mobile, flujo de penal/presentación y una
auditoría + expansión grande del cuestionario.

> **Verde local completo:** `typecheck · lint · build · 107 unit · 59 db`.
> **DB de prod:** las 2 migraciones nuevas aplicadas + ledger reconciliado.
> **Front:** commit + `git push origin main` (Vercel publica solo).

### Tareas hechas esta sesión (jun 22)

- **Fondo mobile** — `PitchBackground.tsx`: fade menos oscuro (`opacity 0.12→0.17`, `blur 5→4px`)
  y contenedor `fixed inset-0 h-full`→`fixed inset-x-0 top-0 h-[100svh]` para centrar la cancha
  en el viewport visible de mobile (antes el viewport grande con barra de URL dejaba aire arriba
  y cortaba abajo). Desktop intacto.
- **Cartel de penal arriba del arco** — `PenalLive.tsx`: los carteles de resultado y de penal
  activo pasan de `mb-auto` (que el `my-auto` del wrapper de `app/partido/page.tsx` recentraba,
  tapando la pateada) a posición `fixed` anclada arriba (`top-[8%]` / `top-[5%]`, con
  `max-h-[90svh]` + scroll en el activo). Ya no tapa la animación 3D.
- **Grupos 10s→5s** — migración `20260622120000_groups_timing_5s.sql`: `begin_presentation` usa
  `round_deadline = LEAST(round_deadline, now()+7s)` (2s país + 5s grupos) sin el guard frágil
  `>now()+8s` que dejaba gobernar el backstop; `start_tournament` backstop `15s→10s`. Test
  `round_clock` al día.
- **Cuestionario 500→700** — migración `20260622130000_questions_audit_and_expand.sql`: pirámide
  por embudo de jugadores (easy 269 / medium 184 / hard 165 / very_hard 82). Sin borrar: 23
  very_hard infladas→hard + wc-302→easy; reescritas (UPDATE) wc-472 (dato desactualizado),
  wc-313 (autorrevelación), wc-357/347/358 (triviales genéricas) y 9 duplicados; +200 nuevas
  (wc-501..wc-700) sesgadas a easy/medium, datos durables a jun 2026.

### Tareas hechas sesión previa (16 pedidos)

- **T1** — Guardar avatar ya no queda colgado en "Guardando…": `handleSave` con try/catch/finally
  (siempre resetea `saving`, navega con `router.replace` o muestra error). `AvatarCreator.tsx`.
- **T2** — Perfil (logueado) scrollea: `<main>` pasó a `min-h-0 flex-1 overflow-y-auto`
  (patrón de la rama guest). `app/perfil/page.tsx`.
- **T3** — Tablas de grupos: sacado el swatch de camiseta en `TeamChip` (solo bandera + nombre).
  `components/bracket/Bracket.tsx`.
- **T4** — Pantalla de grupos: grupo propio ya no se corta arriba (wrapper `my-auto` en
  `app/partido/page.tsx` → centra cuando entra, scrollea cuando desborda) + sacado el link
  "Volver al inicio" de `TournamentLive.tsx`.
- **T5a** — Mobile logueado: "Mi perfil"/"Cerrar sesión" full-width igualando `PlayMenu`.
  `app/page.tsx`.
- **T5b** — Desktop: fondo de cancha completo y centrado (`PitchBackground` `slice`→`meet`);
  los lados quedan con el mismo fondo uniforme, sin corte visible.
- **T6** — Eliminadas las "curiosidades" (`questions.explanation`): UI (`PenalLive`,
  tipo en `lib/realtime/penal.ts`) + RPCs (`resolve_penalty`/`get_penalty_result` recreados
  sin el campo) + DROP de columna y datos. Migración `20260621130000_drop_explanation.sql`
  (aplicada a prod: 0 columnas, 500 preguntas intactas).
- **T7** — Tras los grupos se ven los cruces ~4s (lead-in del bracket 2s→4s, como el reveal de
  grupos). Migración `20260621140000_ko_reveal_4s.sql` (aplicada a prod). Test `round_clock` al día.
- **T8** — "32avos" → "16avos" en `RunSummary.tsx` y `HistoryEntryCard.tsx` (32 clasificados =
  round_of_32 = 16avos en español; no hay round of 64).
- **T9** — Al perder en fase directa, primero se ven los cruces ~4s y después el cartel de
  derrota (`koRevealDone` + `KO_LOSS_REVEAL_MS` en `TournamentLive.tsx`).
- **T10** — SEO: `FAQPage` JSON-LD agregado al `@graph` de la landing (rich results). El resto
  ya estaba (metadata/OG/sitemap con lastmod+priority/robots/JSON-LD/manifest/canonical).
  **OPS:** ✅ dominio verificado en Search Console (propiedad de dominio) + `sitemap.xml` enviado
  (2026-11-13, 3 páginas descubiertas).
- **T11-T14** — Menú sin loguear reescrito (`app/page.tsx` + `GuestButton.tsx`): 3 botones de
  mismas dimensiones; "Crear cuenta" ahora primary/prominente, "Entrar" y "Jugar invitado"
  outline; orden mobile Crear/Entrar/Invitado; pirámide en desktop (Crear arriba centrado,
  Entrar abajo-izq, Invitado abajo-der).
- **T16** — Título "TANDA" ya no se corta en mobile logueado (mismo wrapper `my-auto` que T4).

### Deploy
- **DB:** ✅ aplicado a prod (`drop_explanation`, `ko_reveal_4s`) + ledger reconciliado.
- **Front:** commit + `git push origin main`.

## Cómo correr / testear / deployar

```bash
pnpm dev | build | lint | typecheck      # desarrollo + checks
pnpm knip                                 # guard de código muerto
pnpm test                                 # unit (motor de juego/torneo)
pnpm db:start && pnpm db:reset && pnpm test:db   # suite SQL/RPC (Docker)
```

- **Deploy front**: commit + `git push origin main` (Vercel → https://tanda2026.com.ar).
- **Deploy DB**: aplicar cada migración nueva de `supabase/migrations/` a prod por MCP
  (`apply_migration`, orden por timestamp); el MCP versiona con la hora real → reconciliar el
  ledger (`supabase_migrations.schema_migrations`) para que matchee los filenames; `get_advisors`.

## Dónde vive cada cosa

- `lib/engine/` — motor TS puro y determinista (regla del juego + modo invitado).
- `supabase/migrations/` — esquema + RPCs `SECURITY DEFINER`: fuente de verdad de la DB.
  Set canónico: `baseline_schema` · `wiring` · `seed` · `session_fixes` · `session_b2_c_optim`
  · `questions_refresh` · `session_f_timing` · `fast_tick` · `groups_timing` · `lobby_1min`
  · `groups_fixture_gap` · `groups_ko_pause` · `nation_kit_colors` · `questions_to_500`
  · `drop_explanation` · `ko_reveal_4s` · `groups_present_deterministic` · `history_group_loss`
  · `groups_timing_5s` (grupos 5s) · `questions_audit_and_expand` (banco a 700).
- `supabase/tests/` — suite del camino autoritativo (CI guardrail).
- `app/` — rutas (Server Components). `components/` — UI. `components/ui/` — primitivas.
  3D (R3F) solo en avatar y penal.

## Verde de referencia
`typecheck` · `lint` · `build` · `knip` · **107 unit** + **59 db**.

> Protocolo: una cosa a la vez, verificar con output real, commit descriptivo. Cambios de
> arquitectura grandes → consultar a Gino primero.

## ⏸ E2E del flujo de juego — rama `wip/e2e-flow` (desde main, 14/11), falta revisión + merge

Independiente de `wip/avatar-glb` y `wip/post-6b`. Verde: `typecheck · lint · knip · build · 145 unit ·
77 db` + `test:e2e:flow` ✓ (2 corridas seguidas, ~1,5 min c/u).
- **`pnpm test:e2e:flow`** (`scripts/e2e/flow.sh` + `playwright.flow.config.ts` + `e2e/flow/game.spec.ts`):
  invitado (sesión anónima) → Jugar → Mundial → sala → lobby (minuto real) → `/partido` → responde el
  primer penal (queda fijo, botones bloqueados) → resolución GOL/ATAJADO. Además verifica que
  `correct_index` no viaja (REST ni frames de Realtime) mientras el penal está abierto.
- **Solo contra Supabase LOCAL**: el script saca URL/keys de `supabase status`, aborta si la API no es
  `127.0.0.1`/`localhost` y las exporta (pisan a `.env.local`, que apunta a prod); el spec tiene un
  segundo seguro. `pnpm test:e2e` (smoke) ignora `e2e/flow/`. Stack: `pnpm e2e:stack` (auth, kong,
  postgrest, realtime, cron; sin studio/storage/etc.) + `pnpm db:reset`. Ojo: deja `.next` construido
  contra la DB local → `pnpm build` antes de otro uso.
- **Hallazgo → migración `20261119000000_explicit_table_grants`**: en local, `authenticated` no tenía
  SELECT sobre `profiles`/`rooms`/… (el baseline solo trae REFERENCES/TRIGGER/TRUNCATE/MAINTAIN y el
  default ACL local nuevo no da más) → la home de un invitado/logueado quedaba como landing ("Entrando…")
  y la sala no cargaba. Prod funciona porque sus tablas heredaron grants completos del default ACL viejo
  de la plataforma. La migración da SELECT en `profiles, rooms, participants, tournaments, teams` y
  UPDATE solo de `profiles(username, avatar)`; nada de tablas de juego. `rls_audit` (d) fija esa
  superficie.
  **Para Gino antes de aplicarla en prod** (solo lectura, por MCP `execute_sql`):
  `select table_name, string_agg(privilege_type, ',') from information_schema.role_table_grants where
  table_schema='public' and grantee='authenticated' group by 1;` → si prod da `SELECT/INSERT/UPDATE/DELETE`
  sobre tablas de juego (`penalties`, `questions`…), RLS sin policy igual las bloquea, pero conviene
  revocarlos y dejar prod == repo (el test (d) describe la superficie buscada).

**Para mergear (con OK de Gino):** `git merge wip/e2e-flow` + aplicar `20261119000000_explicit_table_grants`
por MCP `apply_migration` (después de mirar los grants de prod, arriba) + reconciliar ledger.

## 💡 Ideas para la próxima (14/11, al cerrar avatar-glb + post-6b + e2e-flow)
Orden de merge sugerido: `wip/avatar-glb` → `wip/post-6b` (migración `…18…`) → `wip/e2e-flow` (`…19…`).
1. **Grants de prod** (antes de mergear e2e-flow): correr la query de solo lectura de arriba; si prod
   tiene SELECT/escritura sobre tablas de juego, sumar a la migración los `revoke` para dejar prod == repo.
2. ✅ **Job de CI `e2e-flow`** (rama `wip/ideas-e2e`, `.github/workflows/ci.yml`): `e2e:stack` + `db:reset` +
   `test:e2e:flow` (game + ranked, ~4 min) con el Chrome del runner; sube las trazas si falla. Sin probar
   en GitHub todavía (no hay push): mirarlo en el primer PR.
3. ✅ **E2E ranked 1v1** (`e2e/flow/ranked.spec.ts`, rama `wip/ideas-e2e`): dos invitados en contextos
   separados → cola → se emparejan entre sí → partido completo (A toca la 1ª opción, B la última → la
   muerte súbita siempre termina) → "Ganaste"/"Perdiste" con deltas de signo opuesto. ~3 min. Helpers
   compartidos en `e2e/flow/_helpers.ts`. `pnpm test:e2e:flow` (los dos specs) ✓ en 3,9 min.
4. ✅ **E2E hasta el campeón** (`e2e/flow/champion.spec.ts`, rama `wip/ideas-e2e`): el invitado juega el
   Mundial entero acertando al toque (la correcta la lee el TEST directo del Postgres local vía
   `E2E_DB_URL`; ni la secret key puede leer `questions`) → los bots tardan ≥4 s → gana todo → "¡Campeón!",
   CTA de cuenta y copa de oro en `/perfil`. ✓ en 11,2 min → fuera de CI: `E2E_SLOW=1 pnpm test:e2e:flow
   champion`. Las 2 corridas colgadas en "Entrando…" eran un bug real → ver
   "Fix del invitado" abajo (rama `wip/fix-guest`).
5. ✅ **Pirámide de dificultad del Mundial** (rama `wip/ideas-questions`): recalibrada a mano → easy 215 ·
   medium 212 · hard 188 · very_hard 85 (34 suben a easy, 16 hard bajan a medium). Recalibrar con aciertos
   reales cuando haya datos post-wipe.
6. ✅ **Filtraciones lejanas** (rama `wip/ideas-questions`): `questions:check` agrupa en temas los pares
   fuertes que no se parecían en el texto (mismo año + contexto, título ↔ campeón, sede). Migración de
   sync `20261121000000_question_topics_leaks` (incluye la idea 5). Quedan pistas débiles en `--leaks`.
7. ✅ **Avatar** (rama `wip/ideas-avatar`): `WarmGlbBodies` precarga los dos GLB y sus templates en el
   creador. `templateOf` 40–53 ms a CPU 4× (headless), `instantiate` 1–6 ms. Falta medir en teléfono real.
8. ✅ **"Flake" de `tournament_e2e` = bug real** (rama `wip/ideas-e2e`): el greedy de `build_knockout`
   (y `buildRoundOf32` en TS) a veces cruzaba en 16avos a dos del MISMO grupo según el seed (~2%: 7 de 300
   seeds; también en prod). Arreglo: pasada de reparación determinista en TS + migración
   `20261120000000_knockout_same_group_fix` (port 1:1). Tests: propiedad de 5000 seeds en el motor y 300
   seeds reales en la DB (sin el fix fallan 24, 33, 145…; con el fix 0). **Aplicar en prod con OK de Gino.**
9. **CSP**: pasar `Content-Security-Policy-Report-Only` a enforcing (en local loguea las conexiones a
   127.0.0.1; agregar `http://127.0.0.1:54321` solo en dev).
10. **Supabase CLI 2.106 → 3.x** y deps mayores (three, @supabase/ssr): decisión de Gino (major).

## 🐛 Fix del invitado colgado en "Entrando…" (rama `wip/fix-guest`, sobre `wip/ideas-e2e`)
**Causa (traza de Playwright de la falla real):** tras el sign-in anónimo OK, `GuestButton` hace
`router.push("/") + router.refresh()` → dos renders del home en paralelo con el MISMO token. En uno,
`GET /rest/v1/profiles` volvió **401 `PGRST303` "JWT issued at future"** (PostgREST v14 compara el `iat`
contra su reloj cacheado al segundo y el token tenía milisegundos) → `username` null → el server
renderizó el landing; ese render llegó último y `GuestButton` tenía `busy=true` sin vuelta atrás →
"Entrando…" para siempre. El otro render (200) sí traía el home. Puede pasar en prod (mismo PostgREST,
mismo flujo; también tras login con password). No lo pude forzar con curl (0/40 seguidas, 0/15 con 3 s y
0/6 con 45 s de ociosidad): es una carrera fina, la evidencia es la traza (cuerpo de 79 bytes = PGRST303).
**Fix:**
- `lib/supabase/iatRetry.ts`: `withIatRetry()` como `global.fetch` de los clientes server y browser →
  ante 401 PGRST303 "issued at future" espera 1,1 s y reintenta UNA vez; todo lo demás pasa tal cual.
  Test: `lib/supabase/iatRetry.test.ts` (reintenta, no loopea, no toca otros 401, body legible).
- `GuestButton`: la navegación va en `useTransition` → si el home igual vuelve al landing, el botón se
  rehabilita (y el usuario puede reintentar) en vez de quedar colgado.
- `app/page.tsx` (causa de fondo, del code review): logueado vs landing se decide por `user`, no por
  `username`; si `profiles` falla, el nombre sale de `user_metadata.username`. Así ningún error
  transitorio de `profiles` (ni un desfase de reloj > 1,1 s, que el reintento no cubre) manda a un
  usuario logueado al landing. El reintento queda como red para el resto de las consultas del home.
- `GuestButton` reusa la sesión si ya existe (`getSession`) → reintentar no crea un segundo invitado.
- `e2e/flow/guest.spec.ts`: entrada aislada para loop (`pnpm test:e2e:flow guest --repeat-each=20`).
**Verde:** typecheck · lint · knip · 150 unit · build; e2e `game` + `guest` ✓ y `guest` ×20 ✓.
**Pendiente con Gino:** mergear junto con `wip/ideas-e2e` (o cherry-pick de este commit sobre main: no
depende de nada de esa rama salvo el spec e2e). Sin migraciones.

