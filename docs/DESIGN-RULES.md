# Reglas de pantalla — Tanda

Nacieron del feedback de Gino del 14/11 (jugando desde el celular). Cada regla tiene algo que la fija
(test, lint o componente común): si agregás una pantalla, no hay que acordarse, se rompe solo.

| Regla | Por qué | Lo fija |
|---|---|---|
| **Toda pantalla no raíz tiene "volver" al padre** declarado en `lib/nav/routes.ts` (nunca `history.back()`). | "No hay botones para volver". Un link de WhatsApp abre sin historial. | `ScreenHeader` lo pinta solo leyendo el mapa · `lib/nav/routes.test.ts` falla si un `page.tsx` no está en el mapa · e2e `[data-nav=back]` |
| **Tres layouts:** `site` (landing/auth, con footer), `app` (header + scroll interno), `game` (pantalla fija 100dvh, sin footer ni scroll de página). | "Sacá el footer en partida y que quede fija". | route groups `app/(app)`, `app/(game)` · e2e flow `nav.spec` (sin footer, `scrollHeight ≤ innerHeight`) |
| **Toda navegación pasa por `useNav()`**: transición con `pending`, y las salidas con RPC descartable (salir de sala, cancelar cola) navegan YA. | "Volver tarda un montón": se esperaba el RPC antes de navegar. | lint `no-restricted-imports` (`useRouter` solo en `lib/nav`) |
| **Cada grupo tiene `loading.tsx`**. | En rutas dinámicas el prefetch de `<Link>` solo baja hasta el `loading`: sin él, cada toque esperaba el SSR completo. | archivos `app/loading.tsx`, `app/(app)/loading.tsx`, `app/(game)/loading.tsx` |
| **Sesión en el server solo con `getSession()`** (JWT ES256 validado local con `getClaims`). | `getUser()` = una ida a Auth por página (y por request en el proxy). | lint `no-restricted-syntax` sobre `auth.getUser()` en `app/` y `lib/` |
| **Una sola acción principal por pantalla** (el botón rojo `primary`). Jugar, salas, ranked y código viven en `/jugar`; tabla y salir, en el perfil. | La home acumuló Jugar + Crear + Código + Perfil + Tabla + Salir al mismo nivel. | `e2e/_primary.ts` cuenta los `a`/`button` visibles con fondo `bg-brand` (smoke + flow `nav.spec`) |
| **Áreas táctiles ≥ 44px**, probar a 360/375/430. | Se juega con el pulgar. | e2e (`boundingBox` del volver) |
| **Animaciones CSS** (keyframes/transforms) con `prefers-reduced-motion`; en R3F, `useFrame`. | Convención del repo (no hay Framer Motion). | review |
