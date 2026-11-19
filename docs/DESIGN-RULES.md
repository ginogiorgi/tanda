# Reglas de pantalla — Tanda

Nacieron del feedback de Gino del 14/11 (jugando desde el celular). Cada regla tiene algo que la fija
(test, lint o componente común): si agregás una pantalla, no hay que acordarse, se rompe solo.

| Regla | Por qué | Lo fija |
|---|---|---|
| **Toda pantalla no raíz tiene "volver" al padre** declarado en `lib/nav/routes.ts` (nunca `history.back()`). | "No hay botones para volver". Un link de WhatsApp abre sin historial. | `ScreenHeader` lo pinta solo leyendo el mapa · `lib/nav/routes.test.ts` falla si un `page.tsx` no está en el mapa · e2e `[data-nav=back]` |
| **La página scrollea el DOCUMENTO, nunca un panel**, y el **footer es parte del flujo en todas las pantallas** (feedback 2 P4 + feedback 3 #10). Body `min-h-svh flex-col`, contenido `flex-1`: si entra, la página no scrollea y el footer se ve al pie; si no entra, se llega scrolleando. Nunca `fixed`. En PC, home y `/jugar` entran sin scroll (1440×900 y 1366×768). Ver §Layout. | Feedback 2: el shell `h-dvh overflow-hidden` obligaba a scrollear paneles internos. Feedback 3: con el contenido en `min-h-svh` el footer quedaba siempre bajo el pliegue → TODA pantalla scrolleaba en PC. | `app/layout.tsx` · `<Page>`/`<GameStage>` · lint `no-restricted-syntax` (layout) · `e2e/_layout.ts` (smoke `layout.spec` + flow `nav.spec`/`game.spec`, 4 viewports) |
| **Toda navegación pasa por `useNav()`**: transición con `pending`, y las salidas con RPC descartable (salir de sala, cancelar cola) navegan YA. | "Volver tarda un montón": se esperaba el RPC antes de navegar. | lint `no-restricted-imports` (`useRouter` solo en `lib/nav`) |
| **Cada grupo tiene `loading.tsx`**. | En rutas dinámicas el prefetch de `<Link>` solo baja hasta el `loading`: sin él, cada toque esperaba el SSR completo. | archivos `app/loading.tsx`, `app/(app)/loading.tsx`, `app/(game)/loading.tsx` |
| **Sesión en el server solo con `getSession()`** (JWT ES256 validado local con `getClaims`). | `getUser()` = una ida a Auth por página (y por request en el proxy). | lint `no-restricted-syntax` sobre `auth.getUser()` en `app/` y `lib/` (en el cliente es legítimo) |
| **Una sola acción principal por pantalla** (el botón rojo `primary`). Jugar, salas, ranked y código viven en `/jugar`; tabla y salir, en el perfil. | La home acumuló Jugar + Crear + Código + Perfil + Tabla + Salir al mismo nivel. | `e2e/_primary.ts` cuenta los `a`/`button` visibles con fondo `bg-brand` (smoke + flow `nav.spec`) |
| **Áreas táctiles ≥ 44px**, probar a 360/375/430. | Se juega con el pulgar. | e2e (`boundingBox` del volver) |
| **Animaciones CSS** (keyframes/transforms) con `prefers-reduced-motion`; en R3F, `useFrame`. | Convención del repo (no hay Framer Motion). | review |

## Layout

- **Nada `fixed` ni `sticky`**, salvo: fondos decorativos (`PitchBackground`, `data-layer="bg"`), overlays
  transitorios (confeti, sheets/diálogos, `data-layer="overlay"`) y el `ScreenHeader` (`sticky top-0`,
  `data-layer="header"`: el volver siempre a mano). El e2e falla con cualquier otro fixed/sticky.
- **Pantalla de juego = `GameStage`** (`components/ui/GameStage.tsx`), `relative`: en celu mide un viewport
  (menos el header) y el footer queda abajo, scrolleando; desde `md` ocupa el alto disponible (`flex-1`, mínimo
  34rem) y el footer se ve al pie. Escena 3D, tarjeta, globo y HUD van `absolute` adentro. Solo la tarjeta del penal (`data-layer="card"`) puede tener `max-h` + scroll propio
  (360×640).
- **Ancho por tipo de contenido** con `<Page width>` (`components/ui/Page.tsx`): `form` = `max-w-sm`,
  `content` = `max-w-2xl`, `wide` = `max-w-6xl`. Padding lateral 16 px (24 desde `md`). Mobile first, pero
  cada pantalla declara su layout de `lg` (no es "el celu estirado"): el bracket KO es de **dos lados** en
  `lg+` (llaves vacías para las rondas que faltan) y los grupos van en grilla de 2–3 columnas.
- **Sin scroll horizontal de página.** Si algo es más ancho (árbol en mobile), scrollea ese componente en X.
- **Lo fija:** lint (alturas de viewport, `min-h-0`, `overflow-y-auto`, `fixed`/`sticky` en `className` fuera
  de la allowlist de `eslint.config.mjs`) y `e2e/_layout.ts#assertLayout` en 360×640, 430×932, 820×1180 y
  1440×900: footer presente y último del documento, documento ≥ viewport, si entra sin scroll el footer se ve al
  pie, alcanzable scrolleando, nada fijo de más, sin scroll X, y en juego el stage según el ancho (arriba) sin
  desbordes. `fits: true` (home y /jugar en 1440×900 y 1366×768) exige que no haya scroll.
