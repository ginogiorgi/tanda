/**
 * Avatar low-poly compuesto por primitivas a partir de un {@link AvatarConfig}. Sin assets
 * externos: cada pieza es geometría simple tintable. Se renderiza **dentro** de un
 * `<Canvas>` de R3F (ver `AvatarCanvas`). Ver SPEC §8.2.
 */

import type { AvatarConfig, BodyType } from "@/lib/avatar/types";

/** Tono de piel por defecto (el schema del avatar aún no expone color de piel). */
const SKIN = "#d9a06b";

/** Medidas dependientes del cuerpo base. Diferencias sutiles de silueta. */
function bodyDims(bodyType: BodyType): { shoulder: number; hip: number } {
  return bodyType === "female"
    ? { shoulder: 0.42, hip: 0.46 }
    : { shoulder: 0.5, hip: 0.42 };
}

/** Largo de pierna visible según la prenda inferior. */
function bottomLength(part: string): number {
  return part === "shorts" ? 0.35 : 0.7;
}

/** ¿La prenda superior tiene mangas, y de qué largo (0 = sin mangas)? */
function sleeveLength(part: string): number {
  if (part === "tank") return 0;
  if (part === "tee") return 0.18;
  return 0.4; // longsleeve, hoodie
}

interface AvatarModelProps {
  config: AvatarConfig;
}

export function AvatarModel({ config }: AvatarModelProps) {
  const { bodyType, head, hair, top, bottom, shoes } = config;
  const { shoulder, hip } = bodyDims(bodyType);

  const legLen = bottomLength(bottom.part);
  const sleeve = sleeveLength(top.part);

  // Alturas de referencia (de abajo hacia arriba).
  const shoeH = 0.12;
  const legY = shoeH + legLen / 2;
  const torsoH = 0.7;
  const torsoY = shoeH + legLen + torsoH / 2;
  const headY = shoeH + legLen + torsoH + 0.28;
  const legGap = hip / 3;

  return (
    <group position={[0, -0.9, 0]}>
      {/* Zapatos */}
      {[-legGap, legGap].map((x) => (
        <mesh key={`shoe-${x}`} position={[x, shoeH / 2, 0.04]}>
          <boxGeometry args={[0.16, shoeH, 0.28]} />
          <meshStandardMaterial color={shoes.color} />
        </mesh>
      ))}

      {/* Piernas (prenda inferior) */}
      {[-legGap, legGap].map((x) => (
        <mesh key={`leg-${x}`} position={[x, legY, 0]}>
          <boxGeometry args={[0.16, legLen, 0.18]} />
          <meshStandardMaterial color={bottom.color} />
        </mesh>
      ))}

      {/* Torso (prenda superior) */}
      <mesh position={[0, torsoY, 0]}>
        <boxGeometry args={[shoulder, torsoH, 0.26]} />
        <meshStandardMaterial color={top.color} />
      </mesh>

      {/* Brazos: parte cubierta por manga (color de la prenda) + piel hasta la mano */}
      {[-1, 1].map((side) => {
        const x = side * (shoulder / 2 + 0.08);
        const armLen = 0.55;
        const sleevePart = Math.min(sleeve, armLen);
        const skinPart = armLen - sleevePart;
        return (
          <group key={`arm-${side}`} position={[x, torsoY + torsoH / 2, 0]}>
            {sleevePart > 0 && (
              <mesh position={[0, -sleevePart / 2, 0]}>
                <boxGeometry args={[0.12, sleevePart, 0.12]} />
                <meshStandardMaterial color={top.color} />
              </mesh>
            )}
            {skinPart > 0 && (
              <mesh position={[0, -sleevePart - skinPart / 2, 0]}>
                <boxGeometry args={[0.11, skinPart, 0.11]} />
                <meshStandardMaterial color={SKIN} />
              </mesh>
            )}
          </group>
        );
      })}

      {/* Cabeza */}
      <mesh position={[0, headY, 0]}>
        {head === "round" ? (
          <sphereGeometry args={[0.2, 16, 16]} />
        ) : (
          <boxGeometry args={[0.34, 0.34, 0.32]} />
        )}
        <meshStandardMaterial color={SKIN} />
      </mesh>

      {/* Pelo */}
      <HairMesh part={hair.part} color={hair.color} headY={headY} />
    </group>
  );
}

interface HairMeshProps {
  part: string;
  color: string;
  headY: number;
}

function HairMesh({ part, color, headY }: HairMeshProps) {
  if (part === "none") return null;

  const material = <meshStandardMaterial color={color} />;

  switch (part) {
    case "buzz":
      return (
        <mesh position={[0, headY + 0.04, 0]}>
          <sphereGeometry args={[0.205, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2.4]} />
          {material}
        </mesh>
      );
    case "mohawk":
      return (
        <mesh position={[0, headY + 0.22, 0]}>
          <boxGeometry args={[0.06, 0.16, 0.32]} />
          {material}
        </mesh>
      );
    case "bun":
      return (
        <group>
          <mesh position={[0, headY + 0.08, 0]}>
            <sphereGeometry args={[0.22, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
            {material}
          </mesh>
          <mesh position={[0, headY + 0.1, -0.2]}>
            <sphereGeometry args={[0.1, 12, 12]} />
            {material}
          </mesh>
        </group>
      );
    case "long":
      return (
        <group>
          <mesh position={[0, headY + 0.06, 0]}>
            <sphereGeometry args={[0.22, 16, 12, 0, Math.PI * 2, 0, Math.PI / 1.8]} />
            {material}
          </mesh>
          <mesh position={[0, headY - 0.18, -0.12]}>
            <boxGeometry args={[0.34, 0.4, 0.1]} />
            {material}
          </mesh>
        </group>
      );
    case "short":
    default:
      return (
        <mesh position={[0, headY + 0.06, 0]}>
          <sphereGeometry args={[0.215, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2.1]} />
          {material}
        </mesh>
      );
  }
}
