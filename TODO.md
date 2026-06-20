# TODO — TANDA ⚽

## Estado: Rediseño + optimización (multisesión)

Roadmap aprobado para llevar la app a calidad "app oficial FIFA" (dirección **broadcast
premium**) + resolver 5 pedidos concretos. **Reanudar escribiendo "segui"**.

> **Sesión F (timing agresivo) → CÓDIGO HECHO, verde local.** Roadmap completo.
> Verde: `typecheck · lint · knip · build · 107 unit · 58 db` (incl. e2e de torneo completo).
>
> **PENDIENTE de esta sesión (espera OK de Gino):**
> - ⏳ Commit + `git push origin main` (front) **y** aplicar `20260620140000_session_f_timing.sql`
>   a prod por MCP `apply_migration` + reconciliar ledger + `get_advisors`.
> - ⏳ **Gate manual** en `pnpm dev`: cronometrar el ritmo (2s país + 2s grupos · 10s pregunta +
>   ~3s animación · 2s grupo entre partidos · 2s cruces en KO) + gate visual pendiente de antes
>   (raya 3D Sesión E + look broadcast).
>
> **Deploy de la sesión anterior: HECHO.**
> - ✅ Front en prod: commit `ccbf6fa` pusheado a `main` → Vercel.
> - ✅ DB en prod: `20260620120000_questions_refresh.sql` aplicada por MCP (320 preguntas),
>   ledger reconciliado, advisors sin alertas nuevas (perf limpio).

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
- [x] **F — Timing agresivo (Tarea 2)** ✓ verde local (`typecheck·lint·knip·build·107·58`)
    - **Causa real del "hasta 9s" (no era la animación ni el dedup):**
      1. **Bug intra-partido:** el poke a `open_next_round` estaba solo en la rama sin match activo;
         entre penales del MISMO partido `get_active_match` no es null → nadie pokeaba → el penal lo
         abría recién el `tick()` cada **10s**. (El dedup de preguntas es por-torneo y barato; NO se tocó.)
      2. Jitter del poll de `get_active_match` cada 1500ms encima del `round_deadline`.
      3. Pantallas de transición de 6s.
    - **Hecho** (apto 1000+: menos polling, más broadcast):
      - Migración `20260620140000_session_f_timing.sql`: nuevo evento broadcast **`round:next`**
        (`notify_round_next` → el cliente pokea `open_next_round` EXACTO al vencer el deadline).
        Entre partidos `6s→5s` (3s anim + 2s grupo), lead-in KO `6s→2s`, presentación `6s→4s`
        (2s país + 2s grupos). Intra-partido sigue 3s (= animación). `tick()` queda de backstop.
      - Cliente: `TournamentLive` suscribe `round:next` (poke preciso + re-poll), **fix del bug
        intra-partido** (poke cuando `am?.penal == null`), `RESULT_LINGER_MS 1200→3000`,
        `REVEAL_MS 2200→2000`. `PenalLive` fallback poller `1500/1200→600/600`.
      - Tipo `RoundNextPayload` en `lib/realtime/penal.ts`; SPEC §3.3/§9 + test `round_clock` al día.
    - **Pendiente:** gate manual del gap en `pnpm dev` + aplicar migración a prod (ver arriba).
      Diferido aún: restyle de los botones de opción de `PenalLive` (no es timing).
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
  Set canónico de 7: `baseline_schema` · `wiring` · `seed` · `session_fixes` · `session_b2_c_optim`
  · `session_f_timing` (F: `round:next` + tiempos muertos recortados) · `fast_tick` (F2: cron 10s→1s,
  CAUSA RAÍZ — el juego avanzaba solo por el cron porque los pokes del cliente no surtían efecto).
- `supabase/tests/` — suite del camino autoritativo (CI guardrail).
- `app/` — rutas (Server Components). `components/` — UI. `components/ui/` — primitivas del
  design system (desde Sesión A). 3D (R3F) solo en avatar y penal.

## Verde de referencia (pre-rediseño)
`typecheck` · `lint` · `build` · `knip` · **107 unit** + **58 db**.

> Protocolo: una cosa a la vez, verificar con output real, commit descriptivo. Cambios de
> arquitectura grandes → consultar a Gino primero.
