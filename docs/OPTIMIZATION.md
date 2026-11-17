# Pasada de optimización (17/11/2026)

Revisión contra prácticas actuales de Next.js 16 / React 19, three.js + R3F y Supabase. Regla: **sin cambiar
comportamiento**; cada cambio con verificación real (typecheck, lint, tests, `perf:budget`, e2e).

## Aplicado

- **`"use client"` solo con interactividad real:** `PenalHud` y `TimeBar` son presentacionales puros → sin la
  directiva (los sigue usando `PenalLive`, que es cliente; en `/dev/kit` ahora renderizan en el server).
  Barrido: de 35 archivos cliente, solo esos 2 no tenían hooks, handlers ni APIs del browser.
- **Duplicación:** `jscpd` da 0,15% (3 clones). El marco de auth (volver + wordmark + tarjeta) estaba copiado en
  `app/(auth)/layout.tsx` y `app/auth/reset/page.tsx` → `components/auth/AuthShell.tsx`. De paso, bug real: el reset
  montaba su propio `<Footer />` además del de `app/layout.tsx` (**dos footers** en `/auth/reset`); ahora uno.
  Los otros dos clones (campo de contraseña en registro/reset; tabla esperada en un test del motor) no ameritan
  abstracción.
- **Código y deps muertos:** `pnpm knip` y `pnpm assets:check` en verde (ya corren en CI).

## Evaluado y descartado (con números)

- **React Compiler** (`reactCompiler: true`, estable desde Next 16 / Compiler 1.0). El lint ya corre sus reglas
  (`eslint-plugin-react-hooks` 7: purity, refs, immutability…) y pasa, así que el código es compatible. Pero
  medido con `pnpm perf:budget`: **+1 a +9 KB gz por ruta** (`/partido` 241,4 → 250,3 KB, rompe el presupuesto de
  248). Sin un problema de re-renders medido que pague ese costo en una app mobile-first, no se activa. Revisar si
  aparece un componente con re-renders caros (el candidato sería `PenalLive`), y en ese caso probar
  `compilationMode: "annotation"` + `"use memo"` solo ahí.
- **`use cache` / Cache Components** para datos de referencia (naciones, modos): requiere `cacheComponents` y
  cambia el modelo de render de todas las rutas → es un cambio de arquitectura, no una limpieza. Candidato a
  tanda propia.

## Ya estaba bien (verificado)

- **three/R3F:** code-split (`next/dynamic`) con chequeo en CI de que `three` no entra en ningún chunk de entrada;
  `dpr` acotado (`[1, 2]` creador, `[1, 1.75]` penal); `frameloop` a demanda fuera de la jugada en vivo y con
  reduced motion; sin `setState` ni objetos nuevos dentro de `useFrame`; materiales por instancia liberados al
  desmontar; templates del GLB cacheados por cuerpo.
- **Supabase:** sesión en el server con `getClaims` local (sin ida a Auth por página, regla de lint); advisor de
  performance sin `auth_rls_initplan` ni FKs sin índice; solo `unused_index` (INFO) en índices de FK con poco
  tráfico post-wipe → se mantienen.
- **Next:** `next/font` (sin CLS por fuentes), `next/image`, `loading.tsx` en raíz y en `(app)`/`(game)`,
  Supabase del browser cargado a demanda fuera de las pantallas de juego (regla de lint), presupuesto de JS por
  ruta en CI (`pnpm perf:budget`).

## Fuentes

- [Next.js 16 (release)](https://nextjs.org/blog/next-16) · [`reactCompiler`](https://nextjs.org/docs/app/api-reference/config/next-config-js/reactCompiler)
- [Next.js — Package bundling / analyzer](https://nextjs.org/docs/app/guides/package-bundling)
- [R3F — Scaling performance](https://r3f.docs.pmnd.rs/advanced/scaling-performance)
- [Supabase — RLS performance and best practices](https://supabase.com/docs/guides/troubleshooting/rls-performance-and-best-practices-Z5Jjwv)
