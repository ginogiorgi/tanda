# TODO — TANDA ⚽

`ESTADO ACTUAL: F2 — 2.1 y 2.2 LISTAS y verificadas E2E. Avatar redefinido a 3D (R3F + Quaternius CC0; ver SPEC §8.2). Decisión cerrada: en el penal el avatar va sin tintar por nación, la selección se lee solo en HUD/bandera (SPEC §8.3 #1). Próximo: 2.3 setup 3D (R3F/drei + pipeline de assets Quaternius).`

> Una tarea a la vez, en orden. Al terminar cada una: verificar con output real
> (`typecheck`/`lint`/`build`/tests según aplique), tildar el checkbox, actualizar
> `ESTADO ACTUAL`, y hacer un commit descriptivo. No saltear.

---

## FASE 0 · Arranque
- [x] 0.1 Leer `docs/BRIEF.md` completo
- [x] 0.2 Entrevista de decisiones difíciles (timing, bots, realtime, auth)
- [x] 0.3 Escribir `SPEC.md`
- [x] 0.4 Escribir `PLAN.md`
- [x] 0.5 Escribir `TODO.md`
- [x] 0.6 Escribir `CLAUDE.md`
- [x] 0.7 Aprobación de Gino sobre SPEC/PLAN/TODO antes de codear

## F1 · Scaffold
- [x] 1.1 Inicializar Next.js (App Router) + TS estricto + pnpm
- [x] 1.2 Tailwind + design tokens paleta Mundial 2026 (CSS vars / theme) + fuente
- [x] 1.3 Estructura de carpetas (`app/`, `lib/`, `lib/engine/`, `supabase/`)
- [x] 1.4 Cliente Supabase (browser + server) y `.env.example`
- [x] 1.5 ESLint + tsconfig estricto + scripts (`dev/build/lint/typecheck/test`)
- [x] 1.6 CI GitHub Actions (typecheck + lint + build + test) — comandos verificados local
- [x] 1.7 Deploy "hello world" a Vercel (URL viva) → https://tanda-phi.vercel.app
      (dominio final tanda2026.com.ar, DNS propagando)

## F2 · Auth + Avatar + Perfil
- [x] 2.1 Migración + RLS de `profiles`; auth username (email sintético) — aplicada vía
      MCP, advisors security+performance en 0 lints
- [x] 2.2 Pantallas signup / login — E2E verificado (signup→sesión, login→sesión, trigger
      crea el profile). Auth config: mailer_autoconfirm=true, secure_email_change=false
- [ ] 2.3 Setup 3D: React Three Fiber + drei, code-split, pipeline de assets Quaternius
      (cuerpos base ♂/♀ + outfits modulares + animaciones), validar partes intercambiables
- [ ] 2.4 Creador de avatar 3D: personaje rotable (drag) + 4 selectores (cabeza/pelo,
      remera, pantalón, zapatos) + toggle cuerpo base + default + preview en vivo
- [ ] 2.5 Guardar avatar (JSON en `profiles.avatar`); editar desde Perfil; chequeo de
      username disponible (en registro)
- [ ] 2.6 Perfil: email real opcional (`auth.updateUser`) + recuperación
- [ ] 2.7 Perfil: pestaña Historial (selección, fase de eliminación, resumen) + stats
      agregadas (títulos, win %, goles, mejor posición, torneos jugados)

## F3 · Motor de partido (TS puro) + datos + tests
- [ ] 3.1 Migraciones del modelo de juego (§2 SPEC) + RLS
- [ ] 3.2 `lib/engine/penalty.ts` (resolución pura, 6 casos §5.2)
- [ ] 3.3 Segunda chance ("los dos mal", 5s, 2 opciones)
- [ ] 3.4 `lib/engine/match.ts` (tanda de 5, alternancia, muerte súbita)
- [ ] 3.5 Tests Vitest del motor (todas las filas §5.2 + súbita + alternancia)

## F4 · Realtime
- [ ] 4.1 `create_room` / `join_room` / `quick_play` + RLS de rooms/participants
- [ ] 4.2 Lobby con Presence + countdown 2 min + cancelar sala sin humanos
- [ ] 4.3 Broadcast `penal:start` (sin correcta) y suscripción cliente
- [ ] 4.4 `select_option` (respuesta cambiable, timestamp server, validaciones)
- [ ] 4.5 `resolve_penalty` a los 10s, idempotente, aleatoria a ausentes + encadenado
- [ ] 4.6 Reloj de ronda con barrier por penal (espera segunda chance) + posiciones en
      vivo en el tiempo muerto + animación de duración fija (≤5s)
- [ ] 4.6b Offset de reloj cliente/servidor (barra fiel al `deadline`, no al reloj local)
- [ ] 4.7 `tick()` por `pg_cron` (backstop de penales/rooms)
- [ ] 4.8 Reconexión: `get_active_match` rehidrata tras refresh
- [ ] 4.9 Animación GOL/ATAJADO disparada por `penal:result`

## F5 · Bots
- [ ] 5.0 Seed de `nations`: 48 clasificados 2026 + `fifa_rank` + accent/flag
- [ ] 5.1 Modelo de dificultad por nación/ranking FIFA (§7.2)
- [ ] 5.2 Relleno de cupos con bots + naciones aleatorias + reparto de humanos 1 por grupo
- [ ] 5.3 `bot_intents` precomputados/materializados (incl. segunda chance y muerte súbita)
- [ ] 5.4 Botón Abandonar (`abandon`): participante → bot (dificultad por nación),
      usuario vuelve al home, penales en curso se resuelven como bot

## F6 · Motor de torneo + tests
- [ ] 6.1 `lib/engine/tournament.ts`: grupos, fixture, puntos (3/1/0, empate)
- [ ] 6.2 Clasificación: 2 por grupo + 8 mejores terceros + desempates FIFA (+ sorteo seed)
- [ ] 6.3 Mapeo determinista de terceros + bracket `round_of_32 → … → final` + `third_place`
- [ ] 6.4 `simulate_bot_match` instantáneo + avance event-driven con gate por fase
- [ ] 6.5 Marcadores en vivo en bracket (`score:live`)
- [ ] 6.6 Tests Vitest del torneo (grupos, terceros, desempates, mapeo, bracket, campeón)

## F7 · Banco de preguntas
- [ ] 7.1 Tabla `questions` + `tournament_questions` (no-repeat)
- [ ] 7.2 Generar 200+ preguntas correctas por dificultad/categoría
- [ ] 7.3 Seed script + asignación por fase (§9.3)
- [ ] 7.4 Asignación 1 pregunta por (ronda, penal-index) compartida; bot-only no consume

## F8 · UI / animaciones premium
- [ ] 8.1 Menú principal con botón "Jugar" (quick-play) + crear/unirse por código
- [ ] 8.2 Escena de penal 3D (R3F): cancha + arco + pelota + avatares pateador/arquero;
      tarjeta de pregunta 2D centrada con la escena atenuada/desenfocada detrás
- [ ] 8.3 Barra de tiempo (roja + vibración al final)
- [ ] 8.4 Animaciones 3D por causa: `goal` / `save` (estirada) / `miss_wide` (afuera),
      con variantes + colocación aleatoria por seed (Mixamo retarget o fallback procedural)
- [ ] 8.5 Bracket estilo mundial con marcadores en vivo + pre-partido
- [ ] 8.6 Resumen de fin de partido (marcador + penal a penal + "Jugar de nuevo"/"Inicio")
- [ ] 8.7 Audio (silbato/multitud/gol/atajada + mute, desbloqueo por gesto)
- [ ] 8.8 Responsive total (mobile + desktop) + transiciones entre pantallas
- [ ] 8.9 Compartir sala con Web Share API (fallback copiar código)
- [ ] 8.10 HUD de tanda (marcador, "Penal N de 5", pateás/atajás, opción resaltada)
- [ ] 8.11 Revelar correcta + `explanation` al resolver; "sos vos" en bracket/grupos
- [ ] 8.12 Pantalla campeón (trofeo/confeti) + teclado desktop (1/2/3) + prefs persistentes
- [ ] 8.13 Links de sala inválidos: mensaje claro + fallback a "Jugar"

## F9 · Pulido
- [ ] 9.1 Auditoría RLS + anti-trampa (correct_index nunca al cliente)
- [ ] 9.2 Estados carga / empty / error en cada vista
- [ ] 9.3 Accesibilidad (`prefers-reduced-motion`) + performance
- [ ] 9.4 Manejo de errores robusto
- [ ] 9.5 Rate-limit (`quick_play`/`select_option`/`abandon`) + resuscripción Realtime
      automática tras caída + disclaimer "no afiliado a FIFA"
- [ ] 9.6 Verificación end-to-end §12 + deploy final
