/**
 * Avatar low-poly humano (estilo "malla decimada", facetado pero orgánico) compuesto por
 * primitivas a partir de un {@link AvatarConfig}. Sin assets externos. Mira hacia +Z (cámara
 * en +Z): la cara (nariz + ojos) marca el frente para que la rotación se note. Proporciones
 * ~7 cabezas. Dos cuerpos con **silueta característica** (hombre en V, mujer reloj de arena)
 * vía radios distintos, no solo escala. Ver SPEC §8.2.
 */

import type { AvatarConfig, BodyType } from "@/lib/avatar/types";

const SKIN = "#d9a06b";
const EYE = "#2a211b";
const SEG = 6; // segmentos radiales bajos → facetado low-poly

/** Mitad de la altura total (~1.86), para centrar el modelo en el canvas. */
const HALF_HEIGHT = 0.93;

// Alturas de referencia (pies en y=0, hacia arriba).
const ANKLE = 0.08;
const KNEE = 0.5;
const HIP = 0.92;
const WAIST = 1.1;
const SHOULDER = 1.48;
const NECK_TOP = 1.6;
const HEAD_CY = 1.71;
const HEAD_R = 0.15;

interface BodyShape {
  scale: number;
  shoulderR: number;
  waistR: number;
  hipR: number;
  limbR: number;
  bust: boolean;
}

const BODY: Record<BodyType, BodyShape> = {
  male: { scale: 1, shoulderR: 0.255, waistR: 0.17, hipR: 0.19, limbR: 0.076, bust: false },
  female: { scale: 0.93, shoulderR: 0.165, waistR: 0.115, hipR: 0.26, limbR: 0.053, bust: true },
};

/** Cilindro (low-poly) entre dos alturas, con radios top/bottom (permite ahusar). */
function Bone({
  x = 0,
  z = 0,
  yBottom,
  yTop,
  rBottom,
  rTop,
  color,
}: {
  x?: number;
  z?: number;
  yBottom: number;
  yTop: number;
  rBottom: number;
  rTop: number;
  color: string;
}) {
  return (
    <mesh position={[x, (yBottom + yTop) / 2, z]}>
      <cylinderGeometry args={[rTop, rBottom, yTop - yBottom, SEG]} />
      <meshStandardMaterial color={color} flatShading />
    </mesh>
  );
}

/** Esfera low-poly (articulaciones, cabeza, etc.). */
function Joint({
  x = 0,
  y,
  z = 0,
  r,
  color,
  scale,
}: {
  x?: number;
  y: number;
  z?: number;
  r: number;
  color: string;
  scale?: [number, number, number];
}) {
  return (
    <mesh position={[x, y, z]} scale={scale}>
      <sphereGeometry args={[r, 8, 6]} />
      <meshStandardMaterial color={color} flatShading />
    </mesh>
  );
}

function topStyle(part: string): { upperArm: boolean; foreArm: boolean; hood: boolean; bulk: number } {
  switch (part) {
    case "tank":
      return { upperArm: false, foreArm: false, hood: false, bulk: 1 };
    case "tee":
      return { upperArm: true, foreArm: false, hood: false, bulk: 1 };
    case "hoodie":
      return { upperArm: true, foreArm: true, hood: true, bulk: 1.18 };
    case "longsleeve":
    default:
      return { upperArm: true, foreArm: true, hood: false, bulk: 1 };
  }
}

function bottomStyle(part: string): { coversShin: boolean; tapered: boolean } {
  if (part === "shorts") return { coversShin: false, tapered: false };
  if (part === "joggers") return { coversShin: true, tapered: true };
  return { coversShin: true, tapered: false }; // pants: recto
}

interface AvatarModelProps {
  config: AvatarConfig;
}

export function AvatarModel({ config }: AvatarModelProps) {
  const { bodyType, hair, top, bottom, shoes } = config;
  const b = BODY[bodyType];
  const ts = topStyle(top.part);
  const bs = bottomStyle(bottom.part);

  const legX = b.hipR * 0.5;
  const shoulderX = b.shoulderR * 0.92 + b.limbR;
  const elbow = 1.12;
  const wrist = 0.82;
  const shinColor = bs.coversShin ? bottom.color : SKIN;
  const shinTopR = b.limbR;
  const shinBotR = bs.tapered ? b.limbR * 0.62 : b.limbR; // jogger ahusa al tobillo

  return (
    <group position={[0, -HALF_HEIGHT * b.scale, 0]} scale={b.scale}>
      {/* ── Piernas ── */}
      {[-legX, legX].map((x) => (
        <group key={`leg-${x}`}>
          {/* muslo (siempre prenda inferior) */}
          <Bone x={x} yBottom={KNEE} yTop={HIP} rBottom={b.limbR} rTop={b.limbR * 1.25} color={bottom.color} />
          <Joint x={x} y={KNEE} r={b.limbR} color={shinColor} />
          {/* pantorrilla */}
          <Bone x={x} yBottom={ANKLE} yTop={KNEE} rBottom={shinBotR} rTop={shinTopR} color={shinColor} />
          {bs.tapered && <Joint x={x} y={ANKLE + 0.02} r={shinBotR * 1.25} color={bottom.color} scale={[1, 0.5, 1]} />}
          {/* zapato */}
          <Shoe x={x} part={shoes.part} color={shoes.color} />
        </group>
      ))}

      {/* ── Cadera + torso (achatado en Z) ── */}
      <group scale={[1, 1, 0.74]}>
        {/* pelvis (prenda inferior) */}
        <Bone yBottom={HIP - 0.04} yTop={WAIST} rBottom={b.hipR} rTop={b.waistR * 1.1} color={bottom.color} />
        {/* torso ahusado cintura→hombros (prenda superior) */}
        <Bone
          yBottom={WAIST}
          yTop={SHOULDER}
          rBottom={b.waistR}
          rTop={b.shoulderR * ts.bulk}
          color={top.color}
        />
      </group>

      {/* pecho femenino (fuera del achatado, para que proyecte al frente) */}
      {b.bust &&
        [-0.055, 0.055].map((x) => (
          <Joint key={`bust-${x}`} x={x} y={1.36} z={b.waistR * 1.15} r={0.07} color={top.color} scale={[1, 0.85, 0.8]} />
        ))}

      {/* hombros redondeados (sutiles, no hombreras) */}
      {[-1, 1].map((s) => (
        <Joint key={`sh-${s}`} x={s * b.shoulderR * ts.bulk * 0.92} y={SHOULDER - 0.03} r={b.limbR * 0.95} color={ts.upperArm ? top.color : SKIN} />
      ))}

      {/* ── Brazos ── */}
      {[-1, 1].map((s) => {
        const x = s * shoulderX;
        return (
          <group key={`arm-${s}`}>
            <Bone x={x} yBottom={elbow} yTop={SHOULDER} rBottom={b.limbR * 0.85} rTop={b.limbR} color={ts.upperArm ? top.color : SKIN} />
            <Joint x={x} y={elbow} r={b.limbR * 0.85} color={ts.foreArm ? top.color : SKIN} />
            <Bone x={x} yBottom={wrist} yTop={elbow} rBottom={b.limbR * 0.7} rTop={b.limbR * 0.85} color={ts.foreArm ? top.color : SKIN} />
            <Joint x={x} y={wrist - 0.03} r={b.limbR * 0.8} color={SKIN} />
          </group>
        );
      })}

      {/* ── Cuello + cabeza ── */}
      <Bone yBottom={SHOULDER - 0.04} yTop={NECK_TOP} rBottom={0.078} rTop={0.066} color={SKIN} />
      <Joint y={HEAD_CY} r={HEAD_R} color={SKIN} scale={[0.92, 1.12, 1]} />
      {/* nariz */}
      <mesh position={[0, HEAD_CY - 0.01, HEAD_R * 0.92]}>
        <coneGeometry args={[0.035, 0.07, 4]} />
        <meshStandardMaterial color={SKIN} flatShading />
      </mesh>
      {/* ojos */}
      {[-0.06, 0.06].map((x) => (
        <mesh key={`eye-${x}`} position={[x, HEAD_CY + 0.04, HEAD_R * 0.86]}>
          <boxGeometry args={[0.04, 0.04, 0.02]} />
          <meshStandardMaterial color={EYE} />
        </mesh>
      ))}

      {/* ── Pelo ── */}
      <HairMesh part={hair.part} color={hair.color} />

      {/* ── Capucha (solo buzo) ── */}
      {ts.hood && (
        <mesh position={[0, NECK_TOP + 0.02, -0.06]} scale={[1, 1, 1.1]}>
          <sphereGeometry args={[0.17, 8, 6, 0, Math.PI * 2, 0, Math.PI / 1.7]} />
          <meshStandardMaterial color={top.color} flatShading side={2} />
        </mesh>
      )}
    </group>
  );
}

interface HairMeshProps {
  part: string;
  color: string;
}

/** Pelo como casquete esférico a radio mayor que la cabeza → no traspasa. Deja la cara. */
function HairMesh({ part, color }: HairMeshProps) {
  if (part === "none") return null;
  const mat = <meshStandardMaterial color={color} flatShading />;
  const r = HEAD_R + 0.02;

  switch (part) {
    case "buzz":
      return (
        <mesh position={[0, HEAD_CY, 0]} scale={[0.92, 1.12, 1]}>
          <sphereGeometry args={[HEAD_R + 0.005, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2.6]} />
          {mat}
        </mesh>
      );
    case "mohawk":
      return (
        <mesh position={[0, HEAD_CY + HEAD_R * 1.0, 0]}>
          <boxGeometry args={[0.05, 0.16, 0.24]} />
          {mat}
        </mesh>
      );
    case "bun":
      return (
        <group>
          <mesh position={[0, HEAD_CY, 0]} scale={[0.95, 1.12, 1]}>
            <sphereGeometry args={[r, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2.2]} />
            {mat}
          </mesh>
          <Joint y={HEAD_CY + HEAD_R * 0.9} z={-HEAD_R} r={0.07} color={color} />
        </group>
      );
    case "long":
      return (
        <group>
          <mesh position={[0, HEAD_CY, 0]} scale={[0.98, 1.12, 1]}>
            <sphereGeometry args={[r, 8, 6, 0, Math.PI * 2, 0, Math.PI / 1.9]} />
            {mat}
          </mesh>
          {/* melena por la espalda */}
          <mesh position={[0, HEAD_CY - 0.22, -HEAD_R * 0.7]}>
            <boxGeometry args={[0.22, 0.36, 0.06]} />
            {mat}
          </mesh>
        </group>
      );
    case "short":
    default:
      return (
        <mesh position={[0, HEAD_CY, 0]} scale={[0.96, 1.12, 1]}>
          <sphereGeometry args={[r, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2.05]} />
          {mat}
        </mesh>
      );
  }
}

/** Zapato diferenciado por tipo. Puntera hacia +Z. */
function Shoe({ x, part, color }: { x: number; part: string; color: string }) {
  if (part === "boots") {
    return (
      <group>
        {/* caña hasta el tobillo */}
        <mesh position={[x, ANKLE + 0.06, -0.01]}>
          <cylinderGeometry args={[0.07, 0.075, 0.16, SEG]} />
          <meshStandardMaterial color={color} flatShading />
        </mesh>
        {/* pie */}
        <mesh position={[x, 0.04, 0.06]}>
          <boxGeometry args={[0.13, 0.09, 0.27]} />
          <meshStandardMaterial color={color} flatShading />
        </mesh>
      </group>
    );
  }
  if (part === "cleats") {
    return (
      <group>
        {/* pie puntiagudo */}
        <mesh position={[x, 0.05, 0.08]}>
          <boxGeometry args={[0.12, 0.08, 0.3]} />
          <meshStandardMaterial color={color} flatShading />
        </mesh>
        {/* suela/tapones */}
        <mesh position={[x, 0.0, 0.08]}>
          <boxGeometry args={[0.13, 0.03, 0.31]} />
          <meshStandardMaterial color="#1d1d1d" flatShading />
        </mesh>
      </group>
    );
  }
  // sneakers: bajo y redondeado
  return (
    <group>
      <mesh position={[x, 0.05, 0.05]}>
        <boxGeometry args={[0.14, 0.1, 0.25]} />
        <meshStandardMaterial color={color} flatShading />
      </mesh>
      <mesh position={[x, 0.02, 0.06]}>
        <boxGeometry args={[0.15, 0.04, 0.27]} />
        <meshStandardMaterial color="#f1f1f1" flatShading />
      </mesh>
    </group>
  );
}
