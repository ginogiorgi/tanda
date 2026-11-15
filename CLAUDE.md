# CLAUDE.md — TANDA

Juego de trivia mundialista multijugador en tiempo real. Cada pregunta es un penal.
Calidad "app de multinacional", identidad propia "B · Programa de partido". Producto/reglas en `docs/BRIEF.md`, arquitectura y
contratos en `SPEC.md`, estado actual en `TODO.md`.

## Protocolo de trabajo (reanudable)
- **Al iniciar cualquier sesión: leer `TODO.md`** para el estado actual y cómo correr/deployar.
- Al terminar un cambio: verificar con **output real** (typecheck/lint/build/tests),
  actualizar `TODO.md` si cambió el estado, y commit descriptivo.
- Antes de cualquier cambio de arquitectura grande: **parar y consultar a Gino**.

## Stack
Next.js (App Router) + TypeScript estricto · Supabase (Postgres/Auth/Realtime/RLS/pg_cron;
lógica autoritativa en RPC plpgsql, sin Edge Functions en v1) · Vercel · Tailwind ·
animaciones CSS (no hay Framer Motion) · Vitest. Gestor: **pnpm**.

## Comandos
```
pnpm dev        # desarrollo
pnpm build      # build de producción
pnpm lint       # ESLint
pnpm typecheck  # tsc --noEmit
pnpm test       # Vitest (motor de juego y de torneo)
pnpm test:db    # Vitest contra Postgres local (pnpm db:start && pnpm db:reset antes)
pnpm test:e2e   # Playwright + axe sobre las páginas públicas (Chrome del sistema)
```
(Definir los scripts en F1; mantener estos nombres.)

## Marca (rebrand Tanda 2.0 — "B · Programa de partido")
- Papel `--bg #EDE9DF`, tinta `--ink/--fg #141414`, rojo de imprenta `--brand #D7261E` (texto chico:
  `brand-ink`), azul `--blue #1F3FA8`. Tokens en `app/globals.css`; usar SIEMPRE las clases de token
  (`bg-bg`, `text-fg`, `border-ink`, `bg-brand`…), nunca hex sueltos ni `white/black` de Tailwind.
- Tipos: **Big Shoulders** (`font-display`, titulares/marcadores/botones, mayúscula) + **Instrument Sans**
  (`font-sans`, lectura). `font-mono` = misma sans con cifras tabulares.
- Lenguaje: bordes duros de tinta (`border-2 border-ink`), radios chicos (4–6px), **sombra offset sin blur**
  (`shadow-card`/`shadow-pop`, el botón "se imprime" al apretar), trama de puntos de fondo. Nada de
  gradientes dorados, glows ni glassmorphism.
- Primitivas en `components/ui/*` + `components/brand/Wordmark`. Antes de inventar estilos, reusarlas.
- Kit visual de desarrollo: `/dev/kit` (404 en producción) — revisar ahí los cambios de UI.
- Íconos/escudos: `scripts/brand/build_icons.py` y `scripts/crests/build_crests.py` con
  `assets/fonts/BigShouldersDisplay-Black.ttf` (OFL).

## Pantallas, navegación y layouts (feedback 14/11 — ver `docs/DESIGN-RULES.md`)
- Mapa de pantallas en `lib/nav/routes.ts` (título, **padre**, grupo). Toda página nueva va ahí
  (`routes.test.ts` lo exige); el "volver" lo pinta `components/ui/ScreenHeader`.
- Route groups: `app/(app)` (header + scroll interno), `app/(game)` (pantalla fija 100dvh, sin footer),
  sitio = landing + `(auth)` (con `Footer`). Cada grupo tiene `loading.tsx`.
- Navegación SOLO con `useNav()` (`lib/nav/useNav.ts`); `useRouter` está prohibido por lint fuera de `lib/nav`.
- Sesión en el server SOLO con `getSession()` (`lib/supabase/session.ts`, `getClaims` local); `auth.getUser()`
  prohibido por lint. Funciones de Vercel en `gru1` (`vercel.json`) = misma región que la DB (sa-east-1).

## Convenciones (Pyrux)
- TS estricto: nunca `any`, `as any`, ni `@ts-ignore`.
- Tailwind para todo, nunca CSS inline. Animaciones con CSS (keyframes en `globals.css` /
  transforms), no `useEffect`; respetar `prefers-reduced-motion`.
- Mobile-first en todos los componentes.
- `"use client"` solo con interactividad real. `page.tsx` es Server Component que compone
  directamente; no existe `*PageClient.tsx`.
- UI en español rioplatense; identificadores y código en inglés.

## Gotchas del proyecto (no negociables)
- **Timing y evaluación SOLO en el servidor.** Cliente nunca decide resultados.
- **`correct_index` NUNCA viaja al cliente** (ni por SELECT ni por Broadcast) hasta que
  el penal está `resolved`.
- **RLS habilitada en todas las tablas.** Escrituras de juego solo por RPC `SECURITY
  DEFINER` que validan pertenencia y ventana de tiempo.
- El **motor** (`lib/engine/`) es TS puro y determinista (aleatoriedad por seed) →
  testeable sin red. Es la **fuente de la regla** y corre el **modo invitado** (client-side,
  §8.4). El **camino autoritativo multijugador corre en PLPGSQL** (RPC `SECURITY DEFINER`),
  **NO en Edge Functions** (decisión por escalabilidad, SPEC §1.2/§1.3): las versiones SQL son
  **ports fieles** del motor, verificados por **paridad** contra TS (RNG mulberry32 bit-perfect).
  v1 no tiene Edge Functions.
- El penal **se resuelve recién a los 10s** (no antes). La respuesta **NO es cambiable**: el
  **primer tap queda fijo** (F10/10.11; `select_option` rechaza el cambio con `already_answered`)
  y la rapidez se mide por el `selected_at` de esa única selección (server). El cliente congela el
  contador en el instante del tap.
- Resolución de penal **idempotente** (lock `FOR UPDATE SKIP LOCKED` sobre la fila del penal),
  solo con `now()≥deadline`; se dispara por poke del cliente o `tick()` de `pg_cron`.
- **Desconexión ≠ abandono**: desconexión → respuesta aleatoria hasta reconectar (no pasa a
  bot); **Abandonar** (botón) → bot con dificultad de su nación. Sin auto-abandono.
- Bot-vs-bot se **simula al instante**; solo partidos con ≥1 humano corren en realtime, con
  **reloj de ronda** compartido para sincronizar a todos los humanos.
- **3D solo en dos lugares**: creador de avatar y escena de penal (cancha/arco/arquero/
  pateador/pelota). Todo lo demás es 2D. R3F code-splitteado; personaje **GLB CC0 de
  Quaternius** (`public/models/avatar/`, generado con `scripts/avatar/build-glb.mts`; decisión de Gino en
  Tanda 2.0) **sin fallback 3D**: mientras baja el GLB, placeholder neutro (`Scene3DSkeleton`) y si falla, error
  con reintento (`useGlbReady` decide antes de montar el canvas); la instancia nace posada (nunca T-pose). La escena del penal
  sigue siendo geometría propia. Animación por **rig propio** (`lib/avatar/rig.ts`, clips por keyframes) +
  jugada determinista (`lib/penal/shot.ts`); revisar en `/dev/penal`. El avatar del jugador ES el pateador/arquero
  del penal. Ver SPEC §8.2.
- **Assets originales**: no reproducir emblemas/logos/mascotas/tipografías de FIFA. Solo
  inspirarse en paleta y feel del Mundial 2026.
- Sin secretos en el cliente (`service_role`/`SUPABASE_SECRET_KEY` solo en servidor/CI).
