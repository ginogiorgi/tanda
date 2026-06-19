# TODO — TANDA ⚽

## PLAN MAESTRO — limpieza/optim/features (al decir "seguí", ejecutar esto)

Rama de trabajo: `cleanup-optim-features`. Plan completo en
`~/.claude/plans/quiero-que-investigues-sobre-happy-parasol.md`.

### RESUME PROTOCOL (cuando Gino diga "seguí")
1. Agarrar el **primer `[ ]` sin marcar** de las fases de abajo, en orden.
2. Ejecutarlo, **verificar con el comando indicado** (output real).
3. `git commit` descriptivo, marcar `[x]`, pasar al siguiente. No preguntar nada.
4. Cambios de arquitectura grandes no listados → parar y consultar a Gino.

### Decisiones cerradas (NO volver a preguntar)
1. Remera 3D: **banda diagonal cruzada** (color base + franja diagonal).
2. Banderas: **mostrar banderas reales** (wire up del campo `flag`).
3. Limpieza: **profunda**, archivo por archivo — verificando con tests/build.
4. Infra: dejar **código/SQL listo**; NO pagar plan ahora, documentar el "switch" de escala.

Verde de referencia: `typecheck` · `lint` · `build` · **106 unit** + **52 db**.
Front: push → Vercel (https://tanda2026.com.ar). DB: migraciones por Supabase MCP (`apply_migration`,
orden de timestamp) + `get_advisors` después.

---

### FASE A — Limpieza profunda archivo por archivo
- [x] **A1** Borrar `example.png` (raíz, untracked, sin referencias).
- [x] **A2** Centralizar SITE_URL en `lib/env.ts` (`canonicalSiteUrl()` usado por `layout.tsx`/`sitemap.ts`/`robots.ts`).
- [x] **A3** Campos de `ParticipantBrief`: `flag`+`accent` hoy sin consumidor de UI (solo type+fixtures).
  Se cablean en Fase B (`flag`→B5 banderas, `accent`→B2.3 styling reveal). Ambos retenidos, no se borran.
- [x] **A4** `next.config.ts`: bundle-analyzer (`ANALYZE=true`) + `optimizePackageImports` (three/R3F). Build verde.
- [x] **A5** Barrido `app/`: sin `*PageClient`, sin imports muertos (knip), `style={{}}` solo en `next/og`
  (icon/apple-icon/og-image, Satori no soporta Tailwind) — legítimo.
- [x] **A6** Barrido `components/`: knip sin dead exports; 22 `"use client"` todos interactivos reales;
  `style={{}}` solo valores dinámicos runtime (`TimeBar`/`Confetti` width %) — patrón correcto.
- [x] **A7** Barrido `lib/`: knip limpio (los 9 tipos eran contrato in-file del motor, cubiertos por
  `ignoreExportsUsedInFile`); sin exports huérfanos ni tipos duplicados.
- [ ] **A8** Docs (`SPEC.md`, `docs/BRIEF.md`, `README.md`, `CLAUDE.md`) al día tras los cambios. *(al final)*
- [x] **A9** knip instalado + `knip.json` + script `pnpm knip` (limpio) + paso en CI (`verify`).
- [x] **A10** `database.types.ts` verificado contra migraciones canónicas: 2 tablas (`rooms`/`profiles`)
  y 16 RPC del cliente coinciden 1:1; `kit_secondary`/datos-de-final fluyen por los shapes TS
  referenciados (`ParticipantBrief`/`TournamentHistoryEntry`), no hacía falta tocar la grilla.
  Único fix: conteo del comentario de cabecera (15→16; `get_penalty_result` lo sumó session_fixes).
- Verif Fase A: `pnpm typecheck && pnpm lint && pnpm build && pnpm test`.

### FASE B — 5 features de gameplay
**B1 — Remera dos colores (banda diagonal):** ✅ COMPLETA + EN PROD
- [x] **Prod limpio + aplicado (2026-06-19):** data de testing truncada en prod (rooms cascade + rate_limits;
  se preservaron nations/questions/profiles/auth). Cambio `kit_secondary`/KSA aplicado a prod por
  `execute_sql`. Advisors: performance 0; security = solo los conocidos (sin nuevos). Ledger prod = 4.
- [x] **Migraciones consolidadas:** `kits_two_color` foldeado en `baseline` (participant_brief) + `seed`
  (KSA lisa) y borrado el archivo suelto → set canónico de 4 (baseline+wiring+seed+session_fixes).
  `db reset` local reproduce todo (52 db verde).
- [x] **B1.1** Migración `20260619120000_kits_two_color.sql`: la data curada (F10) ya tenía 2 colores
  verídicos por país → se mantienen como base+banda; caso lisa: `KSA` flatten a verde (ejemplo del owner).
- [x] **B1.2** RPC `participant_brief` devuelve `kit_secondary` (create-or-replace, revoke public/anon).
- [x] **B1.3** Tipos: `kit_secondary` en `ParticipantBrief` (`lib/realtime/score.ts`); fixtures de test al día.
- [x] **B1.4** `lib/penal/scene.ts`: `kitSash` en `SceneRole` (`sashOf`, cae a base si falta) + test lisa.
- [x] **B1.5** `AvatarModel.tsx`: prop `kitSash` + componente `Sash` (slab diagonal al frente del pecho);
  no se dibuja si `kitSash===kitTop` (lisa) ni en el creador (requiere `kitTop`).
- [x] **B1.6** `PenalScene.tsx`: pasa `kitSash` a ambos `<AvatarModel>`.
- [x] **B1.7** Chips 2D dos tonos: helper `kitSwatchStyle` (gradiente diagonal) en `PenalHud`/`Bracket`.
  Verif: 107 unit + 52 db verde, typecheck/lint/knip/build verde. *(Pendiente: ojo visual en `pnpm dev`.)*

**B2 — Pantalla de revelación de selección (~2s) + fix reloj que corre en lobby:**
- [ ] **B2.1** Fix raíz: `start_tournament` deja `round_deadline` null; nuevo RPC idempotente
  `begin_presentation(tournament_id)` setea `round_deadline = now()+N s` en la 1ª llamada de un humano;
  `tick()` backstop tras un máx. de espera. Server-authoritative (solo timing de presentación).
- [ ] **B2.2** `Lobby.tsx` navega a `/partido` al llegar a 0; `TournamentLive` muestra "armando" + reveal;
  llama `begin_presentation` al estar listo.
- [ ] **B2.3** Estado de revelación en `TournamentLive.tsx` antes del `<Bracket>`: "Te tocó [nación]"
  (bandera+kit+nombre), ~2s, CSS, `prefers-reduced-motion`. Verif: `pnpm test:db` + flujo manual.

**B3 — Animación de penal: cap ~2.5s, sin repeticiones:**
- [ ] **B3.1** `useMemo` del objeto `anim` keyado por `penalty_id+reason+variant` (`PenalLive.tsx:407`).
- [ ] **B3.2** `PenalScene.tsx`: reset de `startRef`/`plan` por `penalty_id` (identidad estable), no por ref.
- [ ] **B3.3** No remontar `PenalLive` entre penales del mismo match (`showPenal`/`RESULT_LINGER_MS`/`key`).
- [ ] **B3.4** Cap visible ~2.5s → siguiente pregunta (poke `open_next_round`) o estado de espera (B5);
  ajustar hueco inter-penal del server (`resolve_round` `now()+3s`) si hace falta. Verif: manual + `pnpm test:db`.

**B4 — Segunda chance: entrar a la animación al instante:**
- [ ] **B4.1** `setTimeout` al deadline exacto para pokear `resolve_penalty` (no esperar el tick de 250ms);
  transición optimista a la animación. `PenalLive.tsx`. Verif: manual + `second_chance.test.ts`.

**B5 — Mensaje de espera + banderas reales:**
- [ ] **B5.1** Wire up banderas reales (`flag`=`nations.flag_asset`) en `PenalHud.tsx`/`Bracket.tsx`/reveal,
  SVGs locales lazy (ej. `country-flag-icons`), no CDN.
- [ ] **B5.2** Overlay "Esperando que todos terminen su tanda…" en `TournamentLive.tsx` cuando
  `get_active_match`=null pero torneo `in_progress` y tu match resolvió. Verif: manual 2+ jugadores.

### FASE C — DB: optimización + listo para 1000+ concurrentes
- [ ] **C1** Índice `idx_questions_difficulty ON questions(difficulty)` (hotspot de `take_tournament_question`).
- [ ] **C2** Índice parcial `tournaments(status) WHERE status='in_progress'` (escaneo de `tick()`).
- [ ] **C3** `quick_play` sin lock global: shardear advisory lock o sala abierta con `FOR UPDATE SKIP LOCKED`.
  **Sensible** → verificar `concurrency.test.ts` a fondo.
- [ ] **C4** `tick()`: subir/parametrizar `LIMIT 200`/`LIMIT 100`; reemplazar `exception when others then null` por logging.
- [ ] **C5** Pooler: documentar/dejar Supavisor transaction mode; runtime usa pooler, no conexión directa.
- [ ] **C6** Confirmar 100% Broadcast; documentar en `SPEC.md` que el techo es el tier (Pro 500 / Team 5000).
- [ ] **C7** Documentar lectura de `pg_stat_statements`. Verif Fase C: `pnpm db:reset && pnpm test:db` +
  `EXPLAIN` antes/después + `get_advisors`.

### FASE D — SEO
- [ ] **D1** Componente server `JsonLd`: `VideoGame`+`Organization`(Pyrux)+`WebSite`.
- [ ] **D2** Metadata por ruta en públicas indexables (landing/login/register); privadas siguen `noindex`.
- [ ] **D3** Consolidar `metadataBase`/SITE_URL (una fuente, ver A2).
- [ ] **D4** Verificar sitemap/robots/manifest + URL canónica. Verif: `pnpm build` + revisar `/sitemap.xml` etc.

### FASE E — Velocidad navegador (CWV)
- [ ] **E1** `@next/bundle-analyzer` + `ANALYZE=true pnpm build`, identificar chunks gordos.
- [ ] **E2** `next.config.ts`: `optimizePackageImports`; confirmar three/R3F fuera del bundle inicial.
- [ ] **E3** Fuentes `next/font` (Outfit) `display:swap`+subset, sin CLS.
- [ ] **E4** Banderas (B5.1) lazy/tree-shaken (no cargar las 48 de una).
- [ ] **E5** Lighthouse en build de prod (LCP/INP/CLS), corregir lo crítico. Verif: `pnpm build` + Lighthouse.

## Cómo correr / testear / deployar

```bash
pnpm dev | build | lint | typecheck      # desarrollo + checks
pnpm test                                 # unit (motor de juego/torneo)
pnpm db:start && pnpm db:reset && pnpm test:db   # suite SQL/RPC (Docker)
```

- **Deploy front**: commit + `git push origin main` (Vercel publica solo).
- **Deploy DB**: aplicar cada migración nueva de `supabase/migrations/` a prod por MCP
  (`apply_migration`), en orden de timestamp; correr `get_advisors` después.

## Dónde vive cada cosa

- `lib/engine/` — motor TS puro y determinista (regla del juego + modo invitado). Testeable
  sin red. Su **port fiel a plpgsql** (verificado por paridad) corre el camino autoritativo.
- `supabase/migrations/` — esquema + RPCs `SECURITY DEFINER`: **fuente de verdad** de la DB.
- `supabase/tests/` — suite del camino autoritativo (CI guardrail).
- `app/` — rutas (Server Components). `components/` — UI. 3D (R3F) solo en avatar y penal.

## Hecho la última sesión (registro)

16 fixes de gameplay/UI + cierre de los 2 pendientes del TODO. DB: migración `20260618120000_session_fixes`
(lead-in de ronda para ver grupos/bracket antes del 1er penal con 10s plenos; `get_penalty_result` para
rehidratar resultado perdido; segunda chance que le quita a CADA jugador su propia opción; history con
datos del partido final), aplicada a prod por MCP + **ledger reconciliado a los 4 archivos canónicos**
(baseline_schema + wiring + seed + session_fixes) + advisors sin alertas nuevas. Front: lobby sin
parpadeo, redirect por origen tras guardar avatar, pelo de avatares pegado, warning THREE.Clock
silenciado, texto del penal legible sobre el arco, bracket = árbol completo con cartel de rival y grupo
en su fase, victoria/historial/stats pulidos, crédito Pyrux+JM10 en la landing. Detalle en el git log.

Sesión previa: limpieza de docs + código/deps muertos (knip: −`@react-three/drei`), paralelización de
queries en server pages, metadatos de lanzamiento (OG/SEO) + PWA, consolidación de migraciones (45 → 3),
tipado del cliente (`Database` a mano en `lib/supabase/database.types.ts`).

> Bonus opcional (no bloquea): knip en CI como guard de código muerto.

> Protocolo: una cosa a la vez, verificar con output real, commit descriptivo. Cambios de
> arquitectura grandes → consultar a Gino primero.
