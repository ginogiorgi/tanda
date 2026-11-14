# Línea de base de rendimiento — 14/11/2026 (antes de feat/feedback-1411)

Medido desde Rosario sobre prod (`https://tanda2026.com.ar`, commit de `main` 714b898).

## Dónde corre cada cosa
| Pieza | Región | Cómo se midió |
|---|---|---|
| Funciones de Vercel (SSR, proxy) | **iad1 — Washington** | header `x-vercel-id: gru1::iad1::…` (edge en São Paulo, función en iad1) |
| Postgres / Auth de Supabase | **sa-east-1 — São Paulo** | `inet_server_addr()` = `2600:1f1e:…` ∈ prefijos IPv6 de AWS `sa-east-1` (ip-ranges.json) |
| Claves de firma del JWT | **ES256 (asimétricas)** | `/auth/v1/.well-known/jwks.json` → `getClaims()` puede validar local |

Cada ida función→DB cruza São Paulo↔Washington (~110–130 ms de RTT). Un request con sesión hace hoy:
1. `proxy.ts` → `updateSession` → `auth.getUser()` — **red a Auth en cada request, prefetch incluido**.
2. La página → `createClient()` + `auth.getUser()` otra vez (otra ida a Auth).
3. Las queries de la página (1–2 tandas más; `/sala/[code]` hace 3 en serie).
→ ≥ 3–4 cruces en serie ≈ 400–500 ms de server antes de mandar un byte, más el viaje del celu a iad1.

## TTFB en prod sin sesión (6 requests en caliente, p50)
| Ruta | p50 | min | max |
|---|---|---|---|
| `/` | 315 ms | 291 | 357 |
| `/login` | 306 ms | 295 | 341 |
| `/ranking` (redirige) | 303 ms | 286 | 325 |
| `/perfil` (redirige) | 291 ms | 290 | 307 |
| 404 estático (`/jugar` hoy) | 146 ms | 143 | 367 |
Primer request en frío: 1,76 s. Con sesión no se midió en prod (crearía usuarios); se mide en la e2e.

## Build (Next 16 / Turbopack)
Todas las páginas de app son `ƒ` dinámicas; **ningún `loading.tsx`** → el prefetch de `<Link>` no adelanta nada
de una ruta dinámica y cada toque espera el SSR completo. GLB: `avatar-male.glb` 728 KB, `avatar-female.glb`
673 KB, se bajan recién al montar la primera escena 3D.

## Objetivos (presupuesto)
- Funciones en la región de la DB (`gru1`) → cada ida función→DB ≈ 1–5 ms.
- Proxy y páginas con `getClaims()` (sin red a Auth salvo refresh).
- `loading.tsx` por grupo → tap → header destino visible ≤ 300 ms (e2e mobile).
- TTFB p50 de rutas dinámicas sin sesión ≤ 200 ms medido igual que arriba.
