# Feedback 3 — prueba de Gino con un amigo (18/11/2026)

Pedido de Gino, con sus respuestas a las preguntas de aclaración. Es la fuente del próximo plan.
Cuando el plan esté terminado y en prod, este archivo se borra (lo hecho queda en git).

## Vara de calidad (no negociable)
- Tanda tiene que sentirse **app de multinacional**. Cada punto se pule **al extremo** antes de pasar al
  siguiente: funciona, se ve impecable en mobile y PC, tiene tests, y se verificó con output real.
- Todo lo visual (penal, arquero, arco, campeón, tablas, layout, escudos, botones nuevos) se comprueba con
  **capturas** (Playwright, al menos 390×844 y 1440×900; las animaciones en varios frames). Mirá vos mismo las
  capturas, criticalas como un director de arte exigente e iterá hasta que estén perfectas.
- Gino autoriza **mejoras propias** que veas al pulir cada punto (UX, animación, accesibilidad, performance,
  copy). Sumalas al plan, marcadas como "propia".
- Respetá `CLAUDE.md`, `SPEC.md` y `docs/DESIGN-RULES.md`; si un punto de acá contradice una regla, ganó Gino:
  actualizá la regla y sus tests en el mismo cambio.

## Cómo trabajar
1. Leé todo este archivo, el código involucrado en cada punto y `TODO.md`.
2. Escribí el plan completo en `TODO.md` (sección `## Plan`): fases ordenadas por vos (sugerido: bugs y cosas a
   sacar → revelado del penal y tiempos → vista dron, arquero y arco → sin scroll en PC → campeón → reportes →
   favoritos → escudos). Cada tarea con criterio de aceptación y cómo se verifica. Sé tan largo como haga falta.
3. Arriba de `TODO.md` dejá un bloque `## ⏸ HANDOFF` con el estado mientras el plan siga abierto (así se
   retoma solo a las 08:00 si se corta). Mantenelo al día.
4. Ejecutá fase por fase. **Deploy a prod al cerrar cada fase en verde** (push a main + migraciones por MCP +
   smoke contra prod). Nunca dejar prod roto. Gino revisa todo en prod; no le avises por cada deploy.
5. Al terminar todo: borrá el HANDOFF y este archivo, dejá `TODO.md` con el estado nuevo, anotá una línea en
   `/mnt/hera/Proyectos/gino-os/bot/diario.md` (formato `MMDD HHMM texto`, inglés telegráfico) y commiteá ahí.

## Puntos

### Penal
1. **Vista dron.** La animación del penal pasa a verse desde arriba como un dron **inclinado** (no cenital
   pura): referencia, foto aérea de un área con el arco arriba, el área, la medialuna y el pasto a franjas
   (`/home/ginogiorgi/.claude/channels/telegram/inbox/1795049641507-AQADEA1rGxJs8Ed9.jpg`). Los avatares
   (pateador y arquero) se tienen que seguir viendo y leyendo bien. Cancha con franjas y líneas como la foto.
2. **Revelado al final.** Hoy se ve si la respuesta fue correcta antes de tiempo. Nuevo orden: termina el
   tiempo → la animación muestra si la pelota entra o no → **recién ahí** aparece el mismo cartel de
   correcta/incorrecta que existe hoy (reusarlo, mismo contenido) → se queda **2,5 s** para leer → recién ahí
   la próxima pregunta. Aplica a todos los modos (Mundial, Argentino, Ranked, invitado).
   - Ajustá los tiempos en la fuente única (`TIMING` ↔ `game_timing()`, paridad) para que el server deje el
     hueco justo. **Ojo:** ya pasó que el hueco entre tandas se bugueó y llegó a 10 s. Medí y testeá que el
     hueco real entre penales sea exactamente el esperado (unit + db + e2e del flujo con tiempos medidos), sin
     acumular drift a lo largo de un partido ni de un torneo.
5. **Arquero.** Al tirarse a atajar lo hace con las manos levantadas y parece bugueado. Animación de atajada
   buena y creíble (estirada lateral, brazos hacia la pelota, caída), también cuando no llega. Verificar con
   capturas frame a frame en `/dev/penal`.
   **Arco.** En las esquinas superiores se nota que son 3 tubos. Esquinas redondeadas y mejor modelo del arco
   a tu criterio (palos, travesaño, red, sombras). Verificar con capturas.

### Torneos y pantallas de juego
3. **Fútbol argentino, entre partidos** (tu próximo partido + tablas): en PC la tabla de la otra zona se ve
   gigante y la de la zona A chica. Las dos con el mismo tamaño y bien compuestas.
12. **Fase de grupos:** entre fechas, los resultados de cada partido se ven un instante antes de pasar a la
   tabla. Que se vean **al menos 2 s** antes de entrar a la tabla (ajustar tiempos en la fuente única y testear).
16. **No repetir preguntas:** la mecánica para que en un torneo no te toque una pregunta que ya te tocó anda en
   Mundial pero **no en fútbol argentino**. Arreglarla y cubrirla con tests para todos los modos.
6. **Pantalla de campeón:** sacar el papelito que hoy cae encima del resultado y los botones. En su lugar,
   papelitos en el **fondo, sobre la cancha**, como tirados desde la tribuna hacia adentro. Resultado y botones
   tienen que leerse perfecto. Respetar reduced motion.
11. **Sala de espera:** sacar "Arranca solo cuando termine la cuenta" y el rótulo "Sala de espera · <modo>",
   en todos los modos.
13. **Cola de Ranked:** sacar "Solo humanos · 5 penales + muerte súbita · Abandonar = derrota" y "Buscando a
   alguien de tu nivel". En su lugar, cuántos jugadores **más** hay en la cola, en tiempo real y exacto:
   "0 esperando", "1 esperando", "2 esperando"… (sin contarte a vos). Eficiente para la DB.

### Home y textos
7. **Cómo jugar:** eliminar el bloque "Torneos y Ranked — Los torneos van de grupos o zonas al mata-mata hasta
   la final. Ranked es un mano a mano por puntos de liga." (`lib/help/howto.ts`).
8. **Globos de explicación de modo:** cada uno vive dentro de la tarjeta de su modo, salvo Ranked. Poner el de
   Ranked dentro de su recuadro igual que Mundial y Argentino. Eliminar el globo que está a la derecha de
   "Amigos", con su lógica.
9. En la explicación de Mundial y Argentino, eliminar "Liga — No suma puntos de liga: para eso está Ranked."
   (`lib/modes/index.ts`, `NOT_RANKED`).
4. **Creador de avatar:** eliminar el botón "Rehacer"/deshacer con toda su lógica (`AvatarCreator.tsx`).
10. **Sin scroll en PC.** Hoy el footer queda siempre debajo del pliegue, así que toda pantalla scrollea. El
   footer pasa a ser un componente más del flujo: si el contenido entra, la página **no scrollea** y el footer se
   ve al pie; si no entra, scrollea normal. En PC la home y la pantalla después de tocar Jugar entran sin scroll.
   En celu puede scrollear. Nunca footer `fixed`. Actualizar `docs/DESIGN-RULES.md` y los tests de layout.

### Funcionalidades nuevas
15. **Ranking de hinchas.**
   - Botón nuevo en la home entre "Cómo jugar" y "Tu perfil": **"Ranking de hinchas"**.
   - Arriba, dos selectores a la par (horizontal): **club favorito** (clubes del modo fútbol argentino) y
     **país favorito** (selecciones del Mundial). Se pueden cambiar cuando quieras, sin límite.
   - Debajo, dos rankings: países y clubes, por cantidad de jugadores que los eligieron como favoritos.
   - Al crear la cuenta/perfil es **obligatorio** elegir club y país favoritos.
   - En las salas de Mundial (país) y Argentino (club), el jugador tiene **prioridad** para que le toque su
     favorito. Si en la sala hay otro con el mismo favorito, se sortea entre ellos; a los que pierden les toca
     un equipo al azar que **nadie** de la sala tenga como favorito. Invitados: equipo al azar.
   - En la sala de espera, el favorito del modo (escudo/bandera) aparece a la derecha del nombre.
   - **Eficiente:** que no ralentice la creación de partidas ni el lobby (contadores agregados mantenidos por
     trigger o similar, índices, nada de COUNT sobre profiles en caliente). Lógica de asignación en el server.
   - Requiere **borrar todas las cuentas** de la DB de prod (usuarios, perfiles, ranked, historial). Gino lo
     autoriza: hacelo directo en prod cuando la fase esté lista, con export previo a
     `/mnt/hera/Backups/tanda-db/<fecha>/` (fuera del repo) por si acaso.
14. **Escudos.** Revisar uno por uno los de todas las selecciones y todos los clubes argentinos y mejorarlos:
   que se parezcan **lo más posible** a los reales sin ser idénticos (hay algunos que son cualquier cosa).
   Decisión de Gino (18/11): acepta el parecido, Tanda no genera plata; actualizá la regla de "assets originales"
   de `CLAUDE.md` en ese sentido (sigue prohibido el logo/tipografía/mascota de FIFA). Verificar con una
   lámina de capturas de todos los escudos y compararlos contra la referencia uno por uno.
17. **Reportar bugs / pedir mejoras.**
   - Botón **flotante abajo a la derecha**, solo fuera de partida (home y pantallas de menú), nunca en el juego.
   - Abre un formulario corto: tipo (Bug / Mejora) + texto. Lindo, accesible, mobile first, con confirmación.
   - Cada reporte se guarda en una tabla (respaldo) y se manda por mail con Resend
     (`lib/email/resend.ts`) **desde `Tanda <no-reply@tanda2026.com.ar>` a `ginorubengiorgi@pyrux.com.ar`**,
     con asunto exactamente `[Tanda] Bug: <primeras palabras>` o `[Tanda] Mejora: <primeras palabras>` (el
     asistente de Gino arma un filtro de Gmail con eso; no cambies el formato).
   - El mail incluye: nombre de usuario (o "Invitado"), id de usuario, fecha y hora (America/Argentina/
     Buenos_Aires), tipo, mensaje, pantalla/ruta, dispositivo, navegador y SO, tamaño de pantalla, versión
     (commit de Vercel) y lo que consideres útil para reproducir. Sin datos sensibles (ni mail del usuario).
   - Anti-abuso: límite por usuario/IP, largo máximo, HTML escapado, honeypot. La API key nunca al cliente.
