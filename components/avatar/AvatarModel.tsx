/**
 * Avatar low-poly humano compuesto por primitivas a partir de un {@link AvatarConfig}. Sin
 * assets externos. Mira hacia +Z (la cámara está en +Z): la **cara** (nariz + ojos) marca
 * el frente, así la rotación se nota. Proporciones ~7 cabezas. Dos cuerpos fijos
 * (hombre/mujer) por dimensiones. Se renderiza **dentro** de un `<Canvas>`. Ver SPEC §8.2.
 */

import type { AvatarConfig, BodyType } from "@/lib/avatar/types";

/** Tono de piel por defecto (el schema aún no expone color de piel). */
const SKIN = "#d9a06b";
const EYE = "#2a211b";

/** Mitad de la altura total del modelo (feet→cabeza ≈1.86), para centrarlo en el canvas. */
const HALF_HEIGHT = 0.93;

interface BodyShape {
  scale: number;
  shoulderW: number;
  waistW: number;
  hipW: number;
  depth: number;
}

const BODY: Record<BodyType, BodyShape> = {
  male: { scale: 1, shoulderW: 0.5, waistW: 0.34, hipW: 0.38, depth: 0.26 },
  female: { scale: 0.96, shoulderW: 0.4, waistW: 0.28, hipW: 0.44, depth: 0.24 },
};

// Alturas de referencia (pies en y=0, hacia arriba).
const SHOE_H = 0.1;
const SHIN_TOP = 0.55;
const THIGH_TOP = 1.0;
const HIP_TOP = 1.18;
const CHEST_TOP = 1.5;
const NECK_TOP = 1.6;
const HEAD_H = 0.28;
const HEAD_CY = NECK_TOP + HEAD_H / 2;

/** La prenda inferior cubre la pantorrilla (pantalón/jogger) o la deja a piel (short). */
function coversShin(part: string): boolean {
  return part !== "shorts";
}

/** Largo de manga de la prenda superior (0 = sin mangas). */
function sleeveLength(part: string): number {
  if (part === "tank") return 0;
  if (part === "tee") return 0.15;
  return 0.42; // longsleeve, hoodie
}

interface AvatarModelProps {
  config: AvatarConfig;
}

export function AvatarModel({ config }: AvatarModelProps) {
  const { bodyType, hair, top, bottom, shoes } = config;
  const shape = BODY[bodyType];
  const legX = shape.hipW * 0.28;
  const sleeve = sleeveLength(top.part);
  const shinColor = coversShin(bottom.part) ? bottom.color : SKIN;

  return (
    <group position={[0, -HALF_HEIGHT * shape.scale, 0]} scale={shape.scale}>
      {/* Pies (puntera hacia +Z marca el frente) */}
      {[-legX, legX].map((x) => (
        <mesh key={`shoe-${x}`} position={[x, SHOE_H / 2, 0.05]}>
          <boxGeometry args={[0.14, SHOE_H, 0.26]} />
          <meshStandardMaterial color={shoes.color} />
        </mesh>
      ))}

      {/* Pantorrillas */}
      {[-legX, legX].map((x) => (
        <mesh key={`shin-${x}`} position={[x, (SHOE_H + SHIN_TOP) / 2, 0]}>
          <boxGeometry args={[0.13, SHIN_TOP - SHOE_H, 0.15]} />
          <meshStandardMaterial color={shinColor} />
        </mesh>
      ))}

      {/* Muslos (siempre prenda inferior) */}
      {[-legX, legX].map((x) => (
        <mesh key={`thigh-${x}`} position={[x, (SHIN_TOP + THIGH_TOP) / 2, 0]}>
          <boxGeometry args={[0.16, THIGH_TOP - SHIN_TOP, 0.18]} />
          <meshStandardMaterial color={bottom.color} />
        </mesh>
      ))}

      {/* Cadera (prenda inferior) */}
      <mesh position={[0, (THIGH_TOP + HIP_TOP) / 2, 0]}>
        <boxGeometry args={[shape.hipW, HIP_TOP - THIGH_TOP, shape.depth]} />
        <meshStandardMaterial color={bottom.color} />
      </mesh>

      {/* Torso ahusado: cintura (angosta) + pecho (ancho) — prenda superior */}
      <mesh position={[0, HIP_TOP + (CHEST_TOP - HIP_TOP) * 0.27, 0]}>
        <boxGeometry args={[shape.waistW, (CHEST_TOP - HIP_TOP) * 0.55, shape.depth * 0.92]} />
        <meshStandardMaterial color={top.color} />
      </mesh>
      <mesh position={[0, HIP_TOP + (CHEST_TOP - HIP_TOP) * 0.76, 0]}>
        <boxGeometry args={[shape.shoulderW, (CHEST_TOP - HIP_TOP) * 0.48, shape.depth]} />
        <meshStandardMaterial color={top.color} />
      </mesh>

      {/* Brazos: hombro→mano, con manga (color de la prenda) y resto a piel */}
      {[-1, 1].map((side) => {
        const x = side * (shape.shoulderW / 2 + 0.07);
        const armTop = CHEST_TOP - 0.02;
        const armLen = 0.58;
        const sleeveLen = Math.min(sleeve, armLen);
        const skinLen = armLen - sleeveLen;
        const handY = armTop - armLen - 0.05;
        return (
          <group key={`arm-${side}`}>
            {sleeveLen > 0 && (
              <mesh position={[x, armTop - sleeveLen / 2, 0]}>
                <boxGeometry args={[0.11, sleeveLen, 0.12]} />
                <meshStandardMaterial color={top.color} />
              </mesh>
            )}
            {skinLen > 0 && (
              <mesh position={[x, armTop - sleeveLen - skinLen / 2, 0]}>
                <boxGeometry args={[0.1, skinLen, 0.11]} />
                <meshStandardMaterial color={SKIN} />
              </mesh>
            )}
            <mesh position={[x, handY, 0]}>
              <boxGeometry args={[0.1, 0.1, 0.11]} />
              <meshStandardMaterial color={SKIN} />
            </mesh>
          </group>
        );
      })}

      {/* Cuello */}
      <mesh position={[0, (CHEST_TOP + NECK_TOP) / 2, 0]}>
        <cylinderGeometry args={[0.06, 0.07, NECK_TOP - CHEST_TOP, 8]} />
        <meshStandardMaterial color={SKIN} />
      </mesh>

      {/* Cabeza (caja, no esfera) */}
      <mesh position={[0, HEAD_CY, 0]}>
        <boxGeometry args={[0.24, HEAD_H, 0.26]} />
        <meshStandardMaterial color={SKIN} />
      </mesh>
      {/* Nariz (frente, +Z) */}
      <mesh position={[0, HEAD_CY - 0.01, 0.14]}>
        <boxGeometry args={[0.05, 0.06, 0.05]} />
        <meshStandardMaterial color={SKIN} />
      </mesh>
      {/* Ojos (frente, +Z) */}
      {[-0.06, 0.06].map((x) => (
        <mesh key={`eye-${x}`} position={[x, HEAD_CY + 0.05, 0.13]}>
          <boxGeometry args={[0.045, 0.045, 0.02]} />
          <meshStandardMaterial color={EYE} />
        </mesh>
      ))}

      {/* Pelo */}
      <HairMesh part={hair.part} color={hair.color} />
    </group>
  );
}

interface HairMeshProps {
  part: string;
  color: string;
}

/** Pelo en cajas, coherente con la cabeza-caja. Posiciones relativas a `HEAD_CY`. */
function HairMesh({ part, color }: HairMeshProps) {
  if (part === "none") return null;
  const material = <meshStandardMaterial color={color} />;
  const top = HEAD_CY + HEAD_H / 2; // y de la coronilla

  switch (part) {
    case "buzz":
      return (
        <mesh position={[0, top - 0.02, -0.01]}>
          <boxGeometry args={[0.26, 0.06, 0.28]} />
          {material}
        </mesh>
      );
    case "mohawk":
      return (
        <mesh position={[0, top + 0.05, 0]}>
          <boxGeometry args={[0.05, 0.14, 0.26]} />
          {material}
        </mesh>
      );
    case "bun":
      return (
        <group>
          <mesh position={[0, top - 0.03, -0.02]}>
            <boxGeometry args={[0.26, 0.08, 0.28]} />
            {material}
          </mesh>
          <mesh position={[0, top, -0.18]}>
            <boxGeometry args={[0.13, 0.13, 0.13]} />
            {material}
          </mesh>
        </group>
      );
    case "long":
      return (
        <group>
          <mesh position={[0, top - 0.02, -0.01]}>
            <boxGeometry args={[0.27, 0.1, 0.29]} />
            {material}
          </mesh>
          {/* Melena cayendo por la espalda */}
          <mesh position={[0, HEAD_CY - 0.16, -0.15]}>
            <boxGeometry args={[0.26, 0.34, 0.07]} />
            {material}
          </mesh>
        </group>
      );
    case "short":
    default:
      return (
        <group>
          {/* Casquete que cubre arriba y atrás, deja la cara */}
          <mesh position={[0, top - 0.03, -0.01]}>
            <boxGeometry args={[0.26, 0.1, 0.28]} />
            {material}
          </mesh>
          <mesh position={[0, HEAD_CY + 0.02, -0.14]}>
            <boxGeometry args={[0.26, 0.2, 0.05]} />
            {material}
          </mesh>
        </group>
      );
  }
}
