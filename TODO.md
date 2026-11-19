# TODO — TANDA ⚽

## ⏸ HANDOFF
- **Plan:** Feedback 3 (`docs/FEEDBACK-3.md`), escrito el 18/11. Ejecutando fase por fase; deploy a prod al cerrar cada fase.
- **Fase en curso:** F0 (baseline).
- **Último deploy:** — (prod = `96f7041`).
- **Para retomar:** leer `docs/FEEDBACK-3.md` + este plan; `git log --oneline -15`; seguir la primera tarea sin ✅.

En prod: https://tanda2026.com.ar (Mundial + Modo Argentina + Ranked 1v1, invitado, avatar v2).

## Plan — Feedback 3 (18/11)
Fuente: `docs/FEEDBACK-3.md`. Vara: "app de multinacional"; todo lo visual con capturas Playwright a 390×844 y
1440×900 (animaciones en varios frames) mirando cada captura. Cada fase cierra con verde completo
(typecheck · lint · knip · unit · components · db · build · e2e · flow) → push a main → migraciones por MCP +
ledger reconciliado + `get_advisors` → smoke contra prod. "(propia)" = mejora mía autorizada por Gino.

### F0 — Baseline
- [ ] Verde de referencia local (todas las suites) y stack Docker/Chrome funcionando. **Acepta:** misma cifra que el
  verde del 17/11 (o se anota la diferencia y por qué).

### F1 — Bugs y cosas a sacar
- [ ] **1.1 (#7) Cómo jugar** sin el bloque "Torneos y Ranked" (`lib/help/howto.ts`). **Verifica:** test de
  componentes de la hoja + captura.
- [ ] **1.2 (#8) Globos de modo:** el "?" de Ranked pasa ADENTRO de su tarjeta (mismo lugar/estilo que Mundial y
  Argentino); se elimina el "?" de "Con amigos" y su lógica (`PLAY_KINDS.room`). **Verifica:** test de PlayMenu
  (3 globos, todos dentro de su card; ninguno en "Con amigos") + capturas 390/1440.
- [ ] **1.3 (#9)** Fuera "Liga — No suma puntos de liga…" de Mundial y Argentino (`NOT_RANKED`; la sección de
  liga queda opcional en `ModeHelp` y solo Ranked la usa). `modes_help.test.ts` ajustado.
- [ ] **1.4 (#4) Creador de avatar** sin "Deshacer" ni su historial (`AvatarCreator.tsx`). e2e `avatar.spec`
  ajustado; captura.
- [ ] **1.5 (#11) Sala de espera** sin "Arranca solo cuando termine la cuenta" ni "Sala de espera · <modo>" (el
  modo ya va en el header). Todos los modos (es un solo `Lobby`). Captura.
- [ ] **1.6 (#13) Cola Ranked:** fuera "Solo humanos · 5 penales…" y "Buscando a alguien de tu nivel"; en su
  lugar "N esperando" = jugadores **presentes** en la cola **sin contarte**, exacto y en tiempo real (llega en
  cada poll de 2 s, que ya es el latido). DB eficiente: el conteo usa un índice parcial sobre `last_seen`
  (la cola es chica y ya se purga a los 15 s); `ranked_poll` devuelve `waiting_others`. **Verifica:** test db
  (0/1/2 esperando, excluye al propio y a los ausentes), test de componente, captura.
- [ ] **1.7 (#16) No repetir preguntas — todos los modos.** Diagnóstico en prod (18/11): dentro de un torneo NO
  se repite (0 duplicados por jugador); lo que se repite es **entre torneos** (Gino jugó 2 de Argentino seguidos
  y le volvieron preguntas y temas; en Mundial jugó uno solo). Fix: historial por usuario
  `user_seen_questions(user_id, question_id, seen_at)` (PK + índice; se escribe al abrir el penal para los
  humanos del partido) y `take_tournament_question` recibe el partido y **prefiere** preguntas (y temas) que
  ninguno de los humanos vio, luego la vista hace más tiempo; bots-only igual que hoy. Poda: se guardan las
  últimas ~600 por usuario (más que una vuelta de banco) para no crecer sin límite. **Verifica:** test db por
  modo (worldcup, arg, ranked): 2 torneos seguidos del mismo humano → 0 repetidas mientras el banco alcance;
  test de que el invitado también; perf: `explain` con índice.
- [ ] **Cierre F1:** verde + deploy + smoke.

### F2 — Revelado al final y tiempos (#2, #12)
- [ ] **2.1 Regla:** el penal se resuelve **al vencer el tiempo** (se vuelve a la regla de CLAUDE.md: no se cierra
  antes aunque respondan los dos) → nadie ve el resultado antes de tiempo. Aplica a 1ª y 2ª chance, todos los
  modos. *(Revisión con Gino: revierte el cierre anticipado del 14/11; ver "Pendiente de revisión".)*
- [ ] **2.2 Orden del revelado:** termina el tiempo → la escena juega el remate (la pelota entra / la atajan / se
  va) **sin cartel** → recién cuando la jugada se define (`REVEAL_AT` ≈ cuando la pelota llega/queda quieta)
  aparece el MISMO cartel de hoy (GOL/ATAJADO, motivo de velocidad, correcta) → queda **2,5 s** → próximo penal.
  Mientras corre la jugada el audio de gol/atajada se dispara al llegar la pelota, no antes (propia).
- [ ] **2.3 Tiempos en la fuente única:** `TIMING.betweenPenalsS` = `revealS` (jugada) + `resultCardS` (2,5) en
  `TIMING` ↔ `game_timing()` (paridad); se admiten decimales (`numeric`) en el SQL. Entre partidos: jugada + cartel
  + tabla. **Verifica:** unit (las pausas del cliente calzan exactas en los huecos), db (hueco entre penales =
  exactamente `betweenPenalsS` medido sobre `round_deadline`, en un partido completo y en un torneo sin drift:
  el hueco no se acumula ni se multiplica en muerte súbita/2ª chance/cambio de fecha), e2e del flujo con tiempos
  medidos reales (penal N resuelto → penal N+1 abierto) con tolerancia ≤ 1 s, y que el cartel se ve ≥ 2,4 s.
- [ ] **2.4 (#12) Fase de grupos:** entre fechas, los resultados del partido se ven **≥ 2 s** antes de la tabla
  (`MATCH_RESULT_LINGER_MS` y `betweenMatchesS` recalculados; test de tiempos).
- [ ] **2.5 Ranked** usa lo mismo (su `RANKED_RESULT_LINGER_MS` se reemplaza por la jugada + cartel).
- [ ] **Cierre F2:** verde (incluye flow con tiempos medidos) + deploy + medición en prod (un torneo de invitado:
  hueco real entre penales registrado en TODO).

### F3 — Vista dron, arquero y arco (#1, #5)
- [ ] **3.1 Cámara dron inclinada** (no cenital): arco arriba, área, medialuna y punto del penal; pasto a franjas
  anchas y líneas de cal como la foto de referencia. Avatares legibles (pateador abajo de espaldas, arquero
  arriba). Cámara fija con un leve empuje en la jugada (propia), reduced motion = cuadro final. **Verifica:**
  capturas `/dev/penal` 390×844 y 1440×900, idle + 6 cuadros de gol/atajada/afuera.
- [ ] **3.2 Arquero:** atajada creíble — paso de impulso, estirada lateral con el cuerpo extendido, brazos
  hacia la pelota (según altura), caída de costado y reincorporación; cuando no llega, misma estirada sin tocar.
  Nada de manos levantadas sin sentido. **Verifica:** capturas frame a frame (0.2–2.0 s) en `/dev/penal`, tests
  del rig (las manos terminan cerca del `target` en la atajada).
- [ ] **3.3 Arco:** palos y travesaño con esquinas redondeadas (un solo tubo curvado, sin "3 tubos"), postes de
  sección redonda, red con caída y soportes atrás, sombra del arco en el pasto. **Verifica:** capturas de cerca.
- [ ] **Cierre F3:** verde + perf budget de `/partido` + deploy + smoke de penal de invitado en prod.

### F4 — Sin scroll en PC + tablas de Argentino (#10, #3)
- [ ] **4.1 Layout:** el footer es parte del flujo: shell `min-h-svh` con el contenido `flex-1` y el footer al pie →
  si entra, no hay scroll; si no, scrollea el documento. Nunca `fixed`. `GameStage` ocupa el alto restante (no un
  viewport entero), con mínimo para el penal. Home y `/jugar` sin scroll en 1440×900 (y 1366×768, propia).
  `docs/DESIGN-RULES.md` y `e2e/_layout.ts` reescritos: footer visible sin scroll cuando el contenido entra,
  documento scrollea si no entra, nada fijo de más.
- [ ] **4.2 (#3) Argentino entre partidos:** las dos zonas con el mismo tamaño y bien compuestas en PC (tu próximo
  partido arriba, dos tablas iguales lado a lado). Mundial sigue con su grilla. Capturas 390/1440.
- [ ] **Cierre F4:** verde + deploy.

### F5 — Pantalla de campeón (#6)
- [ ] Fuera el confeti que cae encima. Papelitos en el **fondo, sobre la cancha**, tirados desde la tribuna hacia
  adentro (capa detrás del contenido), resultado y botones 100 % legibles; reduced motion = papelitos quietos en
  el pasto. **Verifica:** capturas en 3 frames + test de capa (z-index detrás del contenido).

### F6 — Reportar bugs / pedir mejoras (#17)
- [ ] Botón flotante abajo a la derecha solo en home/menús (nunca en juego; `data-layer="overlay"` permitido),
  hoja con tipo (Bug/Mejora) + texto, accesible, confirmación. Route handler server: valida (zod-free, manual),
  honeypot, largo máximo, rate-limit por usuario e IP (tabla), guarda en `feedback_reports` (RLS deny-all, solo
  service role) y manda mail por Resend con asunto exacto `[Tanda] Bug: …` / `[Tanda] Mejora: …` a
  ginorubengiorgi@pyrux.com.ar con usuario/id/fecha AR/ruta/UA/SO/pantalla/commit. **Verifica:** unit del armado
  del mail (asunto, escape HTML, sin datos sensibles), test db de la tabla y el límite, e2e del formulario,
  capturas, y un reporte real de prueba en prod (Gino lo recibe una vez, marcado "[prueba]" en el texto).

### F7 — Ranking de hinchas (#15)
- [ ] **7.1 DB:** `profiles.fav_club` / `fav_nation` (FK a teams del modo), contadores `fan_counts` mantenidos por
  trigger (sin COUNT en caliente), RPC `set_favorites`, lectura del ranking.
- [ ] **7.2 Registro obligatorio:** el alta pide club y país favoritos (selectores con escudo/bandera).
- [ ] **7.3 Pantalla `/hinchas`:** botón en la home entre "Cómo jugar" y "Tu perfil"; dos selectores a la par
  arriba; debajo, ranking de países y de clubes.
- [ ] **7.4 Asignación en sala:** en `start_tournament` cada humano tiene prioridad para su favorito del modo;
  empates por sorteo (seed); a los perdedores, un equipo que nadie de la sala tenga de favorito; invitados al azar.
  Tests db (con 1, 2 y N humanos con el mismo favorito).
- [ ] **7.5 Sala de espera:** escudo/bandera del favorito a la derecha del nombre (va en el track de presence).
- [ ] **7.6 Wipe de cuentas en prod** (autorizado): export previo a `/mnt/hera/Backups/tanda-db/<fecha>/`, md5,
  después borrar usuarios/perfiles/ranked/historial.

### F8 — Escudos (#14)
- [ ] Regla de "assets originales" de `CLAUDE.md` actualizada (parecido aceptado; FIFA sigue prohibido).
- [ ] Escudos de los 30 clubes rehechos a mano parecidos a los reales; selecciones: revisar una por una (banderas)
  y corregir las que estén mal. Lámina de capturas de todos contra la referencia.

### F9 — Cierre
- [ ] Borrar HANDOFF y `docs/FEEDBACK-3.md`, TODO con el estado nuevo, línea en `gino-os/bot/diario.md`.

### Pendiente de revisión con Gino
- **Cierre anticipado del penal:** para que nadie vea el resultado "antes de tiempo", el penal vuelve a resolverse
  solo al vencer el tiempo (aunque respondan los dos antes). Si preferís mantener el cierre anticipado y solo
  demorar el cartel, es un cambio de una línea en `resolve_penalty`.

## Cómo correr / testear / deployar
```bash
export PATH=$HOME/.npm-global/bin:$PATH           # pnpm no está en el PATH de las shells de Claude
pnpm dev | build | lint | typecheck | knip         # desarrollo + checks
pnpm test && pnpm test:components                  # unit (motor, avatar) + componentes (RTL)
pnpm db:start && pnpm db:reset && pnpm test:db     # suite SQL/RPC contra Postgres local (Docker)
pnpm test:e2e                                      # Playwright + axe sobre páginas públicas (smoke + layout)
pnpm e2e:stack && pnpm db:reset && pnpm test:e2e:flow   # flujo de juego contra Supabase LOCAL (nunca prod)
E2E_BASE_URL=https://tanda2026.com.ar pnpm test:e2e     # smoke contra prod
E2E_BASE_URL=https://tanda2026.com.ar E2E_PROD_GUEST=1 pnpm exec playwright test e2e/prod-guest.spec.ts
pnpm assets:check | perf:budget | questions:check | db:check-migrations | qa:avatar
```
- **Deploy front:** `git push origin main` → Vercel (gru1) → https://tanda2026.com.ar.
- **Deploy DB:** cada migración nueva por MCP `apply_migration` (orden por timestamp). El MCP la versiona con la
  hora real → reconciliar `supabase_migrations.schema_migrations` al nombre del archivo; después `get_advisors`
  (lo esperado: RLS sin policy en tablas de juego, RPC `SECURITY DEFINER` de juego, anon sign-ins).
- **Orden:** front primero si la migración depende del front nuevo; nunca dejar prod roto.

## Dónde vive cada cosa
- `lib/engine/` — motor TS puro y determinista (fuente de la regla). `lib/avatar/`, `lib/penal/` — avatar y jugada.
- `supabase/migrations/` — esquema + RPCs: fuente de verdad de la DB (baseline v2 del 13/11 + incrementales).
- `supabase/tests/` — suite del camino autoritativo (paridad TS↔SQL, anti-trampa, RLS, torneo, ranked).
- `app/` — rutas (Server Components; grupos `(app)`, `(game)`, `(auth)`), `components/` (UI; primitivas en
  `components/ui/`), `e2e/` (Playwright), `scripts/` (assets, catálogo, preguntas, QA, perf).
- Docs: `docs/BRIEF.md` (producto), `SPEC.md` (arquitectura/contratos), `docs/DESIGN-RULES.md`.

## Verde de referencia (17/11)
typecheck · lint · knip · assets · unit 209 · components 48 · db 108 · build · e2e 42 · flow 9 · smoke prod 42 +
penal de invitado en prod.
