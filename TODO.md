# TODO — TANDA ⚽

## Estado: Rediseño + optimización (multisesión)

Roadmap aprobado para llevar la app a calidad "app oficial FIFA" (dirección **broadcast
premium**) + resolver 5 pedidos concretos. **Reanudar escribiendo "segui"**.

> **PRÓXIMA SESIÓN ("segui") → Sesión F (timing ≤3s).** Es lo ÚNICO que queda del roadmap.
> Todos los pointers (archivos:línea + cambios) están en la sección F más abajo. Verde de
> referencia para no romper nada: `typecheck · lint · knip · build · 107 unit · 58 db`.
>
> **Pendientes que esperan OK de Gino (no se hicieron solos: tocan prod / git):**
> 1. Aplicar `20260620120000_questions_refresh.sql` a **prod** (MCP `apply_migration` +
>    reconciliar ledger `schema_migrations` + `get_advisors`).
> 2. **Commit** de todo lo de esta sesión (A–E + G + limpieza); no se commiteó nada aún.
> 3. **Gate visual** en `pnpm dev`: raya 3D (Sesión E) + look broadcast nuevo.

Plan completo: `~/.claude/plans/la-aplicacion-tiene-tipicas-glimmering-blossom.md`.

### Decisiones cerradas
- **Base UI:** primitivas propias en `components/ui/`, sembradas con buen tooling (shadcn/
  tweakcn/registries como referencia y semilla, no dependencia impuesta) para que no queden
  genéricas.
- **Dirección visual:** Broadcast FIFA premium (display expresiva, acento por nación, HUD TV).
- **Preguntas:** ~80 durables + ~20 WC2026 estables, datos reales a hoy.
- **Timing:** optimizar libre para ≤3s (se puede tocar gameplay/feel).

### Progreso por sesión
- [x] **A — Tooling + fundación design system** ✓ verde (typecheck/lint/build)
  - [x] Foundation de primitivas (`lib/cn.ts` + cva/clsx/tailwind-merge)
  - [x] Font display Oswald en `app/layout.tsx` (`--font-oswald` → `font-display`)
  - [x] Tokens en `app/globals.css`: `--bg-raised`, `--ring`, gradientes (gold/accent/pitch),
    sombras (`shadow-card`/`shadow-pop`), utilidades `.bg-gold-grad`/`.bg-accent-grad`/`.bg-pitch`
  - [x] Primitivas en `components/ui/`: Button, Card, Input/Field, Eyebrow/SectionTitle,
    Badge, ScorePill, StatCard, Footer
- [x] **B — Aplicar primitivas + perfil + footer (Tareas 4 y 5)** ✓ verde (typecheck/lint/knip/build/107 unit)
  - [x] Refactor a primitivas: landing, auth (Login/Register/Forgot/Reset/RecoveryEmail/Logout),
    lobby (PlayMenu/GuestButton/Lobby)
  - [x] Tarea 4: perfil orden **Estadísticas → Historial → Tu jugador → Email recuperación**;
    nav **← Inicio + Logout arriba de todo**. Ambas ramas (cuenta y guest).
  - [x] Tarea 5: `Footer` global "Hecho por Pyrux y JM10" al fondo (`app/layout.tsx`); sacado del hero.
  - [x] Paleta del editor de avatar reconciliada a tokens (gold/border/fg en vez de white/opacity).
- [x] **C — Rediseño landing/auth/lobby/reveal** ✓ verde (typecheck/lint/knip/build)
  - Glow de cancha (`bg-pitch`) en landing/auth/sala/avatar; wordmark + headings en `font-display`;
    auth shell glass; NationReveal display; VersusCard + champion broadcast; reloj de lobby display.
- [x] **D — Rediseño HUD de juego** ✓ verde (typecheck/lint/knip/build/107 unit)
  - `Badge`+`ScorePill` reintroducidas y consumidas; PenalHud (marcador ScorePill + rol Badge),
    ResultCard (marcador display + Badge), RunSummary (header display + botones primitiva), VersusCard live.
  - Pendiente menor: restyle de los botones de opción de `PenalLive` → se hace en F (mismo archivo).
- [x] **E — Fix raya 3D camiseta (Tarea 1)** ✓ verde (typecheck/lint/build) — `Sash` reescrito como
  cáscara curva (segmento de cilindro ahusado, comparte taper + achatado Z del torso, offset fino,
  acotado WAIST..SHOULDER, inclinación diagonal). Pendiente: **gate visual de Gino** en `pnpm dev`
  (si el arco saliera en la espalda, cambiar `Math.PI/2` → `-Math.PI/2` en `AvatarModel.tsx`).
- [ ] **F — Timing ≤3s (Tarea 2)** ← **SIGUIENTE / lo único que falta**
    - **Diagnóstico** (gap countdown=0 → próxima pregunta, hoy hasta 9s = suma de 3 demoras seriales;
      la animación ~1.5s NO es el cuello):
      1. Latencia de resultado: fallback poller arranca a **1500ms** post-poke, reintenta 1200ms
         (`components/penal/PenalLive.tsx:281,284`).
      2. Dead time hardcodeado `round_deadline = now()+3s` intra-partido / `+6s` entre partidos
         (`resolve_round`, `supabase/migrations/20260614000000_baseline_schema.sql:2039,2044`).
      3. Apertura del próximo penal: solo la dispara el poll de `get_active_match` cada **1500ms**
         (`components/penal/TournamentLive.tsx:149,160`); si falla cae al backstop pg_cron **10s**
         (`supabase/migrations/20260614000001_wiring.sql:35`).
    - **Plan** (apto 1000+: menos polling, más broadcast): DB → bajar `round_deadline` (~1–1.5s /
      ~2–2.5s), que `resolve_penalty→resolve_round` deje listo el próximo open; cliente → abrir el
      próximo penal **on `penal:result`** + poke inmediato a `open_next_round`, acortar fallbacks,
      mostrar la result card ~1.5s mientras carga el próximo. **+ restyle de los botones de opción
      de `PenalLive`** (diferido de la Sesión D, mismo archivo).
    - **Verificar**: `pnpm db:start && pnpm db:reset && pnpm test:db` (58) + `pnpm test` (107) +
      medición manual del gap ≤3s en `pnpm dev`. Migración nueva + aplicar a prod por MCP.
- [x] **G — Banco de preguntas (Tarea 3)** ✓ verde local (db:reset + **58 db** pasan). Migración
  `20260620120000_questions_refresh.sql`: 4 fixes a presente (2026 ya se juega) + 5 reescrituras de
  duplicados (Fontaine×4/Klose/Ronaldo/tanda-1982, vía UPDATE sin DELETE) + **100 nuevas** (wc-221..320,
  ~20 WC2026 estables + ~80 durables, datos web verificados). Banco: **220 → 320** (easy 88/med 86/
  hard 79/vh 67). **PENDIENTE: aplicar a prod** por MCP `apply_migration` + reconciliar ledger +
  `get_advisors` (espera ok de Gino, junto con el commit).

**Extra (fuera de roadmap, esta sesión):**
- ⚡ CWV: la fuente display Oswald se cargaba con 4 pesos y solo se usa 700 → recortada a
  `["600","700"]` (`app/layout.tsx`), menos bytes de fuente para 1000+ usuarios. Verde (build).
- 🧹 Limpieza: volumen Docker `supabase_db_tanda` removido (regenerable con `db:start`/`db:reset`);
  lista de tareas depurada (solo queda F).

## Cómo correr / testear / deployar

```bash
pnpm dev | build | lint | typecheck      # desarrollo + checks
pnpm knip                                 # guard de código muerto
pnpm test                                 # unit (motor de juego/torneo)
pnpm db:start && pnpm db:reset && pnpm test:db   # suite SQL/RPC (Docker)
```

- **Deploy front**: commit + `git push origin main` (Vercel publica solo → https://tanda2026.com.ar).
- **Deploy DB**: aplicar cada migración nueva de `supabase/migrations/` a prod por MCP
  (`apply_migration`, orden de timestamp); el MCP versiona con la hora real → reconciliar el ledger
  (`supabase_migrations.schema_migrations`) para que matchee los filenames; `get_advisors` después.

## Dónde vive cada cosa

- `lib/engine/` — motor TS puro y determinista (regla del juego + modo invitado). Testeable
  sin red. Su **port fiel a plpgsql** (verificado por paridad) corre el camino autoritativo.
- `supabase/migrations/` — esquema + RPCs `SECURITY DEFINER`: **fuente de verdad** de la DB.
  Set canónico de 5: `baseline_schema` · `wiring` · `seed` · `session_fixes` · `session_b2_c_optim`.
- `supabase/tests/` — suite del camino autoritativo (CI guardrail).
- `app/` — rutas (Server Components). `components/` — UI. `components/ui/` — primitivas del
  design system (desde Sesión A). 3D (R3F) solo en avatar y penal.

## Verde de referencia (pre-rediseño)
`typecheck` · `lint` · `build` · `knip` · **107 unit** + **58 db**.

> Protocolo: una cosa a la vez, verificar con output real, commit descriptivo. Cambios de
> arquitectura grandes → consultar a Gino primero.
