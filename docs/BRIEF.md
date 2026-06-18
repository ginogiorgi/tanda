# BRIEF — TANDA ⚽

> Documento de diseño autocontenido. Es la **fuente de verdad** del producto.
> Guardalo en el repo como `docs/BRIEF.md` y referencialo con `@docs/BRIEF.md`.

---

## 0. Resumen ejecutivo

**Tanda** es un juego de trivia online sobre Mundiales de Fútbol, multijugador y en
tiempo real, con estética de calidad producción. Cada pregunta es un **penal**. Dos
jugadores compiten respondiendo la misma pregunta al mismo tiempo: el que responde
**bien y más rápido** mete el gol o ataja. El juego replica la estructura completa
del **Mundial 2026**: 48 participantes (humanos o bots) que compiten en grupos,
dieciseisavos, octavos, cuartos, semis, tercer puesto y final, hasta coronar un campeón.

**Barra de calidad:** debe sentirse como una **app oficial de FIFA**: pulida,
responsive, mobile-first, con animaciones premium y cero detalles "de demo".

---

## 1. Stack y restricciones técnicas (cerradas)

- **Frontend/SSR:** Next.js (App Router) + TypeScript (modo estricto).
- **Backend:** Supabase → Postgres + Auth + Realtime + RLS + pg_cron. La lógica
  autoritativa del juego corre en RPC plpgsql `SECURITY DEFINER` (sin Edge Functions; ver SPEC §1.2).
- **Hosting:** Vercel.
- **Estado inicial de infra:** SOLO existe el repo de GitHub vacío. Claude scaffoldea
  TODO desde cero, incluyendo instrucciones de setup de Supabase y Vercel y variables
  de entorno (`.env.example`).
- **Idioma de la UI:** español (rioplatense). Identificadores y código en inglés.

### 1.1 Restricción crítica de arquitectura (resolver en SPEC)

El timing es **siempre autoritativo del servidor**, nunca del cliente (anti-trampa).
Pero corren **muchas salas/torneos en simultáneo** y Vercel es serverless (funciones
efímeras, sin loops largos). Hay que definir explícitamente en `SPEC.md` cómo se
resuelven los timers y los "ticks" del juego. Opciones a evaluar con tradeoffs:

- Estado del partido en Postgres como **máquina de estados**; Supabase **Realtime
  (broadcast/presence)** para sincronizar; resolución del penal por **timestamps del
  servidor**; avance de fases por **eventos** (cada respuesta dispara una resolución)
  en lugar de loops continuos.
- Un **scheduler** (`pg_cron` → `tick()` backstop) para cerrar penales cuando se agota
  el tiempo aunque nadie responda, y para mover los bots.
- Bots manejados **del lado servidor** (no en el cliente), con su respuesta agendada
  según dificultad.
  Claude debe proponer la arquitectura final y validarla conmigo antes de codear.

---

## 2. Identidad / cuentas (cerrado)

- **Sign up / login solo con `username` + `contraseña`** (sin email, para no perder
  tiempo). Usar Supabase Auth con un esquema adecuado para login por username.
- Al **crear la cuenta**, el usuario arma un **avatar simple** (ver §3).
- El **nombre en juego** es el `username`.
- La **selección nacional se asigna automáticamente** al entrar al torneo (aleatoria,
  de la lista de clasificados al Mundial 2026). El jugador no la elige.

---

## 3. Creador de avatar (cerrado)

Editor simple, liviano, con piezas **predefinidas** (no editor libre). Render como
SVG/sprite por capas, performante. El usuario elige:

1. **Sexo** (masculino / femenino) → afecta cuerpo base.
2. **Pelo** — set de ~6 opciones predefinidas (estilo + color).
3. **Camiseta** — set de ~8 opciones predefinidas (colores/diseños).
4. **Pantalón** — set de ~4 opciones predefinidas.
5. **Zapatos** — set de ~4 opciones predefinidas.
   Guardar la config del avatar en el perfil (JSON). Mostrar el avatar en lobby,
   pre-partido y resultados. Mantenerlo simple: el objetivo es identidad rápida, no un
   creador AAA.

---

## 4. Dirección visual (cerrado)

Estética inspirada en la identidad oficial del **Mundial 2026** (USA/México/Canadá).

### 4.1 Paleta

- **Núcleo:** negro, blanco y dorado (minimalista, premium). Anclas sugeridas (Claude
  refina en design tokens):
    - Negro/fondo: `#0A0A0A` (y variantes `#121212`, `#1A1A1A`).
    - Blanco/texto: `#FFFFFF` / `#F5F5F5`.
    - Dorado (trofeo): `#C9A227` / `#D4AF37` con realces metálicos.
- **Acentos vibrantes por partido/selección:** el sistema oficial usa colores locales
  vibrantes por sede (celebración de la diversidad). Mapear un acento vibrante por
  selección/partido desde una paleta tipo: azul eléctrico, verde neón, rojo, magenta,
  naranja, teal. Esto le da variedad visual a cada partido.
- Definir todo como **design tokens** (CSS variables / Tailwind theme) desde el inicio.

### 4.2 IP / marca (IMPORTANTE)

Construir **assets originales**. **No** reproducir el emblema oficial, logos, mascotas
ni tipografías de marca registrada de FIFA. Inspirarse en la paleta y el "feel", no
copiar marcas. Usar una tipografía geométrica sans-serif libre (ej. del sistema o de
Google Fonts) que evoque el estilo.

### 4.3 Animaciones premium

- Animaciones CSS/transform performantes (sin Framer Motion). Respetar `prefers-reduced-motion`.
- **Pantalla de penal:** la tarjeta de pregunta + 3 opciones va **centrada**. **Detrás,
  blurreada**, una animación del **arquero en el arco** y el **pateador preparado**.
- Cuando ambos eligen (o se agota el tiempo): la tarjeta **desaparece** y se ve la
  animación de **GOL** o **ATAJADO**.
- Barra de tiempo que decrementa (10s). En los últimos segundos se pone **roja** y la
  pantalla **vibra**.
- Transiciones pulidas entre bracket, pre-partido, penal y resultado.

---

## 5. Mecánica central — el penal

Cada "partido" es una **tanda de 5 penales**. Cada penal es una pregunta de trivia.

### 5.1 Cómo funciona un penal

- Ambos jugadores ven la **misma pregunta exactamente al mismo tiempo**.
- El temporizador arranca simultáneo para los dos. Máximo **10 segundos**.
- 3 opciones (A, B, C), una sola correcta.
- El **servidor** registra el timestamp exacto de cada respuesta (nunca el cliente).
- Se evalúa el resultado y se muestra la animación: **GOL** o **ATAJADO**.

### 5.2 Tabla de resultados del penal

| Jugador 1 (pateador)    | Jugador 2 (arquero)     | Resultado |
| ----------------------- | ----------------------- | --------- |
| ✅ Bien + más rápido    | ✅ Bien + más lento     | J1 GOL    |
| ✅ Bien + más lento     | ✅ Bien + más rápido    | J2 ATAJA  |
| ✅ Bien                 | ❌ Mal o tiempo agotado | J1 GOL    |
| ❌ Mal o tiempo agotado | ✅ Bien                 | J2 ATAJA  |
| ❌ Los dos mal          | ❌ Los dos mal          | ver (1)   |
| ✅ Bien + mismo tiempo  | ✅ Bien + mismo tiempo  | Aleatorio |

**(1) Los dos mal:** desaparece la opción que ambos erraron; quedan **5 segundos** para
elegir entre las **2 opciones restantes**. Si el pateador vuelve a fallar, **gana el J2
(ataja)** porque el que patea la tiró afuera.

### 5.3 Estructura de un partido (tanda de 5 penales)

- 5 penales por equipo, **alternados** como en un Mundial real (J1 patea / J2 ataja,
  luego se invierte, etc.).
- **Fase de grupos:** al terminar los 5 penales se reparten **3, 1 o 0 puntos** según
  el resultado, como un partido real.
- **Eliminación directa:** si hay empate en goles tras los 5 penales, **muerte súbita**:
  tandas extra donde cada jugador patea/ataja hasta que uno meta y el otro no en la
  misma ronda.
- El ganador avanza.

---

## 6. Estructura del torneo (formato Mundial 2026, 48 selecciones)

| Fase             | Equipos | Grupos/Llaves  | Clasifican                        |
| ---------------- | ------- | -------------- | --------------------------------- |
| Fase de Grupos   | 48      | 12 grupos de 4 | 32 (1ros + 2dos + 8 mejores 3ros) |
| Dieciseisavos\*  | 32      | 16 partidos    | 16                                |
| Octavos          | 16      | 8 partidos     | 8                                 |
| Cuartos          | 8       | 4 partidos     | 4                                 |
| Semifinales      | 4       | 2 partidos     | 2                                 |
| 3er y 4to puesto | 2       | 1 partido      | —                                 |
| **FINAL**        | **2**   | **1 partido**  | **🏆 CAMPEÓN**                    |

\* El doc original menciona "octavos" para 32 equipos; con 48→32 el cruce de 32 es
"dieciseisavos". Claude debe implementar el bracket consistente con el formato real
de 32 a partido único hacia la final. Aclarar nombres de fases en SPEC.

### 6.1 Fase de grupos

- 4 equipos por grupo, todos contra todos (3 partidos c/u). No hay empate (siempre hay
  ganador por penales). Victoria = **3 puntos**.
- Clasifican los **2 primeros de cada grupo** (24) + los **8 mejores terceros** = **32**.
- **Mejores terceros:** orden por 1º Puntos → 2º Diferencia de goles en penales →
  3º Goles convertidos totales.
- Empate dentro del grupo: desempate por diferencia de goles en penales.
- Los partidos de **distintos grupos se juegan en simultáneo** (nadie espera).

---

## 7. Sistema de sala y bots

### 7.1 Sala

- Un jugador crea la sala y recibe un enlace para compartir.
- Otros entran por el enlace o desde un botón "Unirse a una sala" en el home.
- La sala espera **máximo 2 minutos** (o hasta llenar los 48 cupos).
- Al cumplirse el tiempo, arranca y los cupos vacíos se llenan con **bots**.
- Cada participante (humano o bot) representa una selección nacional, **asignada
  aleatoriamente** al iniciar. Las selecciones son de la lista de clasificados al
  Mundial 2026.

### 7.2 Dificultad de bots (por selección, según ranking FIFA)

| Nivel    | Selecciones         | % Acierto | Velocidad |
| -------- | ------------------- | --------- | --------- |
| 🔴 ÉLITE | Top 10 ranking FIFA | 80%       | 2–5 s     |
| 🟡 ALTO  | Ranking 10–20       | 70%       | 2–6 s     |
| 🟢 MEDIO | Ranking 20–30       | 60%       | 2–7 s     |
| 🔵 BAJO  | Resto               | 50%       | 2–8 s     |

Los bots corren **del lado servidor**. Su respuesta (correcta/incorrecta y tiempo) se
agenda según su nivel, para que el resultado sea impredecible y realista.

---

## 8. Flujo de pantallas

1. **Home:** crear sala / unirse a sala / login.
2. **Sala de espera:** código para compartir, lista en tiempo real de conectados
   (la selección se asigna al empezar), countdown de 2 minutos.
3. **Bracket (≈4 s):** vista estilo mundial, se actualiza en tiempo real; muestra
   puntos/fase de cada equipo.
4. **Pre-partido (≈3 s):** `[TU PAÍS + bandera] vs [PAÍS RIVAL + bandera]`.
5. **Penal:** pregunta centrada con 3 opciones, animación pateador/arquero blurreada
   detrás, barra de tiempo (10 s, roja + vibración al final), animación GOL/ATAJADO.
6. **Resultado del partido (≈5 s):** marcador final (ej. 4–3), detalle penal a penal
   con tiempos, ganador que avanza.
7. Se repite hasta tener campeón y 3er/4to puesto.

---

## 9. Las preguntas

### 9.1 Temática

**Exclusivamente Mundiales de Fútbol.** Nada de ligas ni clubes. Categorías:
goleadores históricos, campeones y finalistas, estadios y países organizadores,
jugadores y récords, resultados/sorpresas históricas, anécdotas y curiosidades.

### 9.2 Banco (cerrado)

- **Generar un banco de 200+ preguntas**, clasificadas por **dificultad**
  (fácil / intermedia / difícil / muy difícil) y aptas para asignarse por fase.
- Formato: 1 pregunta, 3 opciones (A/B/C), una correcta, 10 s.
- **Sin repetición dentro del mismo torneo.**
- Las preguntas viven en Postgres (tabla `questions`) con `difficulty`, `category`,
  `options`, `correct_index`, `explanation` opcional. Incluir un **seed script**.
- Verificar que las respuestas sean **factualmente correctas** (datos de Mundiales).

### 9.3 Dificultad por fase

| Fase                              | Dificultad                                     |
| --------------------------------- | ---------------------------------------------- |
| Fase de grupos                    | 3 primeros penales fácil, 2 últimos intermedia |
| Dieciseisavos / octavos / cuartos | 3 primeros intermedia, 2 últimos difícil       |
| Semis / 3er-4to / final           | 3 primeros difícil, 2 últimos muy difícil      |

---

## 10. Reglas anti-trampa y seguridad

- Timing y evaluación **solo en el servidor**; el cliente nunca conoce la respuesta
  correcta antes de tiempo ni decide el resultado.
- **RLS** en todas las tablas de Supabase. Sin secretos en el cliente.
- Validar que un jugador no pueda responder dos veces ni fuera de ventana.

---

## 11. Fuera de alcance (v1)

- Chat entre jugadores, ranking global persistente / ELO, monetización, app nativa,
  modos de juego alternativos, edición libre de avatar, internacionalización a otros
  idiomas. (Dejar el código preparado pero no implementar en v1.)

---

## 12. Criterio de verificación end-to-end (definición de "terminado")

El producto está terminado cuando, en un entorno deployado:

1. Un usuario puede registrarse (username+pass), armar avatar y entrar al home.
2. Puede crear una sala, compartir el enlace y que otro humano se una; al vencer los
   2 minutos los cupos se llenan con bots y arranca un torneo de 48.
3. Se juega una tanda completa con timing del servidor, animaciones de GOL/ATAJADO y
   resolución correcta de todos los casos de la tabla §5.2 (incluido el de "los dos
   mal").
4. El torneo avanza correctamente por todas las fases (grupos con puntos y mejores
   terceros, eliminación directa con muerte súbita) hasta coronar campeón y definir
   3er/4to puesto.
5. Varias salas/torneos pueden correr en simultáneo sin interferirse.
6. `typecheck`, `lint`, `build` y la suite de tests del motor de juego y del motor de
   torneo pasan en verde.
