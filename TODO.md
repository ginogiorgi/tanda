# TODO — TANDA ⚽

## Estado: TANDA 2.0 en curso — Fases 0, 1, 3 y 4 HECHAS (Modo Argentina en prod)

Plan completo: `~/.claude/plans/que-onda-arme-esta-typed-pebble.md` (fases 0–7). Deploy directo
a main por fase. Decisiones de Gino en la memoria `tanda-2-0-decisiones`.

> **Verde local completo:** `typecheck · lint · knip · build · 119 unit · 63 db` (incluye e2e AR).
> **DB de prod:** `20261114000000_game_modes` + `20261114000001_seed_catalog_modes` aplicadas por
> MCP, ledger reconciliado, advisors = lo esperado por diseño.

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
- Preguntas AR (sesgo a `idolos`/`historia`, datos dudosos) y Mundial.
- `kit_pattern` aproximados de `data/teams/arg.json` y look de escudos.
- ⚠️ **GOD y TSU son provisorios** (ascensos 2027: final Primera Nacional 14–15/11 + Reducido)
  → migración chica de `teams` + regenerar escudos cuando se definan.

### Próximo (en orden)
1. Pulido AR: tablas de 15 compactas en mobile (bracket), revisar TeamReveal con escudo.
2. **Fase 2 — Rebrand "B · Programa"** (artifact Uu1NeNBEUnysnT2cGUdqrR): tipografías, tokens,
   primitivas, logo nuevo (reemplaza el favicon interino), todas las pantallas.
3. **Fase 5** — preguntas Mundial: dedupe + recalibrar + diversidad de categoría.
4. **Fase 6** — 3D con GLB riggeado. **Fase 7** — Lighthouse/axe/Playwright/docs/AUDIT.

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
