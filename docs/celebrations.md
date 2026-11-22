# Festejos de gol (feedback 4 #16)

Cinco festejos famosos como clips del rig propio (`lib/avatar/celebrations.ts`). El de cada gol sale del
`penalty_id` (FNV-1a → 0..4): todos los clientes ven el mismo y no viaja nada por la red.

| id | Festejo | Referencia | Pose final ("la foto") |
|---|---|---|---|
| `siu` | Siuuu | Cristiano Ronaldo | Salto con medio giro, cae de frente con piernas abiertas, brazos abajo y afuera, pecho y mentón arriba |
| `sky` | Dedicatoria al cielo | Messi | Trota hacia la cámara y termina con los dos brazos estirados al cielo y la mirada arriba |
| `crossed` | Brazos cruzados | Mbappé | Parado firme de frente, brazos cruzados sobre el pecho, mentón arriba |
| `cradle` | La cuna | Bebeto (1994) | Antebrazos adelante "acunando" y balanceo de lado a lado (todo el torso acompaña) |
| `slide` | Rodillazo | Drogba / Henry | Corre hacia la cámara, se tira de rodillas y desliza ~1,2 m con torso atrás y brazos abiertos |

## Decisiones
- **Rig:** se sumaron los tobillos (`ankleL/R` → `foot_l/r` del GLB) para el empeine plano del rodillazo. No se
  mapearon dedos: con el primer plano el índice extendido de Messi mide 2–3 px; la dedicatoria se lee por los brazos
  al cielo y la cabeza atrás. (Pendiente de revisión con Gino.)
- **Cámara:** de lejos el pateador medía ~30 px y ningún festejo se distinguía. En el gol, desde 1,7 s la cámara baja
  y se acerca al pateador (`celebrationCamera` en `lib/penal/camera.ts`), lo sigue si se desplaza y en celu lo deja
  en la mitad de abajo (arriba va el cartel). Reduced motion muestra directo el primer plano con la pose final.
- **Tiempos:** la reacción arranca en `REACTION_AT` (1,6 s); los clips duran 2,4 s y se quedan en la pose final
  hasta el próximo penal (`betweenPenalsS`).

## Guards
- `lib/avatar/celebrations.glb.test.ts` — con el GLB real (FK, sin navegador), en los dos cuerpos: nada atraviesa el
  piso en todo el clip, pies apoyados al final, y un criterio geométrico por festejo (manos sobre la cabeza, cada
  mano en el brazo contrario, antebrazos horizontales, tibias planas de rodillas…). Elección determinista y pareja.
- `lib/penal/camera.test.ts` — el primer plano sigue entero a cada festejo (celu, PC, tablet), cuerpo ≥ 35% del alto,
  en celu debajo del cartel.

## QA visual
- `pnpm dev -p 3301 & QA_BASE_URL=http://localhost:3301 pnpm qa:celebrations [siu,sky]` → cuadros cada 0,2 s en tres
  vistas, hoja de contactos y video por festejo en `artifacts/celebrations/<sha>/`.
- `/dev/avatar/qa?pose=cel-siu&t=1.2&view=wide|wideq34|drone` — un instante.
- `/dev/penal?shot=goal-1&celebration=slide&t=2.8` — con la escena y la cámara del juego; botones por festejo.
- `bash scripts/e2e/shots.sh penal` (`SHOTS_CEL=siu,slide`) — capturas 390/1440 del festejo en el juego.
