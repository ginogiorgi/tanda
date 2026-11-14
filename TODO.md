# TODO — TANDA ⚽

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
