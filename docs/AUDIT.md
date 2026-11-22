# Auditoría integral — Feedback 4 (22/11)

Registro de la pasada de calidad. Cada hallazgo apunta a su causa y al guard que evita que vuelva.

## Código (app/, components/, lib/, scripts/, e2e/)
Barridos automáticos de las reglas del proyecto (sobre todo el árbol, no por muestreo):

| Regla | Resultado | Acción / guard |
|---|---|---|
| `any` / `as any` / `@ts-ignore` | 0 | Ya los prohíbe `strict` + lint. |
| `eslint-disable` | 8, todos con motivo escrito | Revisados: `<img>` de SVG estáticos (escudos), deps de memo del GLB, `set-state-in-effect` de `PenalLive` (sale en Fase C). |
| Colores `white/black` de Tailwind | 9 (`text-white` en Button, Badge, ScorePill, PenalLive) | Token nuevo `--on-fill` → `text-on-fill`. **Lint nuevo** prohíbe `(text\|bg\|border\|…)-(white\|black)`. |
| Hex sueltos en TSX | Solo dev pages, el OG image (ImageResponse no lee CSS) y la paleta 3D del estadio (three no lee tokens) | Excepciones legítimas. |
| `style={{…}}` | OG image, colores de avatar elegidos por el usuario, anchos de barras (valor dinámico) | Excepciones legítimas: el valor es dato, no estilo. |
| `console.*` | Solo server (logs de Vercel) y `app/error.tsx` | El de `error.tsx` se reemplaza por Sentry + reporte automático (Fase F). |
| Remontes por posición en el árbol | `PenalView` devuelve la escena en posiciones distintas por fase | Causa de los puntos 12 y 14 → Fase C (escena en posición fija + test de montajes). |
| `fire()` traga errores | Sí, sin registro | Fase F: los fallos van a Sentry + `client_events`. |

## Dependencias y toolchain
- Todo a latest (A1). TS 7 (nativo) para `typecheck` (0,4 s); TS 6 lado a lado porque typescript-eslint
  todavía no soporta 7 → `typescript` = 6 (ESLint/Next), `typescript7` = 7 (`pnpm typecheck`).
- `@types/node` fijo en 24 a propósito: es el runtime de Vercel (`engines: 24.x`). CI pasó de Node 22 a 24.
- `vitest.config.ts` → `.mts` (warning de configLoader de Vite). knip incluye `.mts/.css`.

## Bundle por ruta (perf:budget, gz)
Piso del framework ≈ 132 KB (`/_global-error`). Las rutas de app quedan en 155–163 KB; las de juego, en
224–247 KB (`/partido` 246,8 / 248). Three/R3F están code-splitteados (fuera de las entradas, lo exige
el budget). El margen de `/partido` es chico: cualquier dependencia nueva del juego va lazy (Sentry
incluido, Fase F).

## DB — tabla por tabla (prod, 22/11)
| Tabla | Filas | Hallazgo | Acción |
|---|---|---|---|
| profiles | 36 | FKs `fav_club_fk`/`fav_nation_fk` sin índice | Índices parciales nuevos. Columna `qa_keep` (exime QA de la poda). UPDATE del cliente limitado por columna (avatar, username): `qa_keep` no es escribible. |
| tournaments | 36 | 26 M seq scans (tick cada 1 s) | Esperado: con decenas de filas el planner elige seq scan; el índice parcial `tournaments_in_progress_idx` cubre el barrido a escala. `tournaments_mode_idx` "sin uso" cubre FK → se queda. |
| rooms | 36 | 12,9 M seq scans | Ídem; `rooms_lobby_starts_at_idx` parcial cubre el barrido de `tick()`. |
| penalties / matches / participants | 558 / 3190 / 1454 | Índices completos (FKs + parcial de abiertos) | OK. |
| questions | 1400 | `questions_topic_idx` nunca usable (topic solo en ORDER BY con expresión) | DROP. |
| bot_intents | 672 | Crecía sin techo (intenciones de penales ya cerrados) | Poda diaria (>1 día, penal resuelto). |
| rate_limits | 126 | Nunca se podaba (ventanas de 1 min) | Poda diaria (>2 días). |
| ops_events | nueva | Registro operativo del server (watchdog, errores de tick) | Poda a 30 días. |
| ranked_season_results / awards | 0 / 0 | Índices "sin uso" cubren FKs | Se quedan. |
| user_seen_questions / feedback_reports | 564 / 2 | Ya tenían poda (120 / 365 días) | OK. |
| auth.users (anónimos) | 33 de 36 | Nunca se borraban | Poda diaria de invitados inactivos 14 días (decisión de Gino), sin tocar a quien está en cola o en juego. |

**RPCs (65).** Todas con `search_path` fijo. Sin uso:
- `open_penalty`: RPC de cliente que abría un penal a pedido, ejecutable por `authenticated` → DROP.
- `penalty_all_answered`: helper del cierre anticipado deshecho en Feedback 3 → DROP.

Pasar las `get_*` volátiles a STABLE se descartó: algunas escriben (`ranked_ensure_player`) y el
beneficio por RPC es nulo.

**Concurrencia.** La carrera del cierre de ronda (punto 20) era el único camino de escritura concurrente
sobre un mismo torneo sin lock compartido. Ahora `resolve_penalty`, `resolve_round` y `open_next_round`
toman el mismo advisory lock (orden advisory → filas en todos). Test con dos conexiones reales.

**Seguridad (advisors).** Lo esperado: RLS sin policy en tablas de juego (acceso solo por RPC definer),
RPCs definer de juego, anon sign-ins. **OPS pendiente:** activar "Leaked password protection" en el
dashboard de Auth (HaveIBeenPwned).

## Tests
| Suite | Antes (20/11) | Ahora |
|---|---|---|
| unit | 267 | 267 |
| components | 52 | 52 |
| db | 135 | 140 (+carrera de ronda, watchdog, podas) |
| e2e público | 46 (solo a mano) | 46, **ahora también en CI** contra el stack local |
| flow | 15 | 15 |

- Sin `.only/.todo/.fixme`. Los `skip` son condicionales y documentados (suites lentas `E2E_SLOW`, prod).
- La espera fija de `game.spec` (2,5 s) es una red lenta simulada a propósito (GLB que tarda y falla), no un sleep.
- La suite `db` ahora puede commitear fixtures (carrera con dos conexiones): pausa el cron `tanda-tick`
  local con `cron.alter_job` y limpia lo creado.
