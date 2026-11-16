# Revisión manual del avatar (P7a)

Capturas: `pnpm qa:avatar` → `artifacts/avatar-qa/<sha>/index.html` (no se commitean; en CI van como
artefacto). Esta revisión: **`dc36e9f`** (P7a rebaseado sobre main `0121c65`), 16/11, Chrome + SwiftShader.

Leyenda: ✅ ok · ⚠ ok con nota · ❌ falla.

## Pelo (cabeza 3/4, nuca, cenital, perfil, canoso)

| Peinado | Male | Female | Nota |
|---|---|---|---|
| none (pelado) | ✅ `pelo_none_male_*` | ✅ `pelo_none_female_*` | cejas siguen al color de pelo (canoso → cejas grises) |
| buzz | ✅ `pelo_buzz_male_*` | ✅ `pelo_buzz_female_*` | cubre el cráneo en las 4 vistas |
| short | ✅ `pelo_short_male_*` | — (no se ofrece en F) | |
| long | ✅ `pelo_long_male_*` | ✅ `pelo_long_female_*` | ya no "corta la cabeza": nuca y cenital cerradas |
| bun | ✅ `pelo_bun_male_*` | ✅ `pelo_bun_female_*` | rodetes enteros desde arriba |

Tinte por luminancia (`HAIR_TEX_MID = 0.32`): negro y castaños se leen distintos; canoso sale gris claro, no
"blanco sucio" → **sin recalibrar**.

## Botines (pies de frente, contrapicado, perfil)

| Variante | Male | Female | Nota |
|---|---|---|---|
| sneakers | ✅ `bot_n_sneakers_*` | ✅ | puntera cerrada, se ve la cara frontal |
| boots | ⚠ `bot_n_boots_*` | ⚠ | igual que sneakers salvo suela más fina: poco distinguible |
| cleats | ⚠ `bot_n_cleats_*` | ⚠ | los tapones solo se ven desde abajo |

→ P7b/P7d: el catálogo ofrece **un** botín (con tapones) + color; las tres variantes de v1 migran a él.

## Poses (3/4)

| Pose | Male | Female | Nota |
|---|---|---|---|
| ready | ✅ | ✅ | sin T-pose (brazos abajo) |
| kick | ✅ | ✅ | |
| dive | ✅ | ✅ | sale del cuadro de la cámara 3/4 (es encuadre de la galería, no del penal) |
| celebrate | ✅ | ✅ | de espaldas a la cámara 3/4 por diseño del clip (festeja hacia la tribuna) |

## Paletas (`swatches.png`)

✅ Pelo 8 · piel 6 · ropa 10 · botines 6, nada chillón, en clave papel/tinta. Ropa vs piel: único ΔE < 15 =
**crudo sobre piel muy clara (12)** → el creador (P7d) no lo arma en presets/aleatorio.

## Piel (P7b, `piel_*_s1…s6`)

✅ 6 tonos × 2 cuerpos con tinte por luminancia en `kitMaterial` (región piel). El tone mapping ACES lavaba
los claros y cerraba los oscuros → compensación en el shader (+30% saturación, lift 0,9). Medido en la mejilla
(cara iluminada): muy clara `#C7AC8E`, morena `#92501C`, muy oscura `#3A1C0C`. Los v1 migran a **morena**
(textura del pack ≈ `#9C6D4D`): no les cambia la cara.

## Creador (P7d, `QA_SHOTS=1 pnpm test:e2e:flow avatar` → `artifacts/avatar-qa/creator/`)

| Pestaña | 360 | 1440 | Nota |
|---|---|---|---|
| Cuerpo | ✅ | ✅ | cuerpo entero, sombra de contacto |
| Piel | ✅ | ✅ | cámara a la cabeza |
| Pelo | ✅ | ✅ | cámara a la cabeza; peinados solo los del cuerpo |
| Equipo | ✅ | ✅ | aviso "la camiseta es la de tu selección" |
| Botines | ✅ | ✅ | cámara a los pies (corregida: arrancaba en las canillas); tapones visibles |

Una sola primaria (Guardar); Aleatorio/Deshacer outline. Primera vez (`from=signup`): 8 puntos de partida.
