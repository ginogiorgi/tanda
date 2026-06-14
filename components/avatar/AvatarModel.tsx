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
const EYE_Y = HEAD_CY + 0.04;

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
  female: { scale: 0.93, shoulderR: 0.165, waistR: 0.115, hipR: 0.21, limbR: 0.053, bust: true },
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

/** Esfera low-poly (hombros, cabeza, etc.). */
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

function topStyle(part: string): { upperArm: boolean; foreArm: boolean } {
  if (part === "tank") return { upperArm: false, foreArm: false };
  if (part === "tee") return { upperArm: true, foreArm: false };
  return { upperArm: true, foreArm: true }; // longsleeve
}

function bottomStyle(part: string): { coversShin: boolean; tapered: boolean; shortHem: number } {
  if (part === "shorts") return { coversShin: false, tapered: false, shortHem: 0.82 };
  if (part === "joggers") return { coversShin: true, tapered: true, shortHem: 0 };
  return { coversShin: true, tapered: false, shortHem: 0 }; // pants
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
  const shoulderX = b.shoulderR * 0.86 + b.limbR;
  const elbow = 1.12;
  const wrist = 0.82;
  const shinColor = bs.coversShin ? bottom.color : SKIN;
  const shinBotR = bs.tapered ? b.limbR * 0.62 : b.limbR; // jogger ahusa al tobillo
  const torsoFlatten = b.bust ? 0.82 : 0.72;
  const isShorts = bs.shortHem > 0;

  return (
    <group position={[0, -HALF_HEIGHT * b.scale, 0]} scale={b.scale}>
      {/* ── Piernas ── */}
      {[-legX, legX].map((x) => (
        <group key={`leg-${x}`}>
          {/* muslo: short corta al `shortHem` (deja la parte baja a piel); pantalón cubre todo */}
          {isShorts ? (
            <>
              <Bone x={x} yBottom={KNEE} yTop={bs.shortHem} rBottom={b.limbR} rTop={b.limbR * 1.08} color={SKIN} />
              <Bone x={x} yBottom={bs.shortHem} yTop={HIP} rBottom={b.limbR * 1.08} rTop={b.limbR * 1.25} color={bottom.color} />
            </>
          ) : (
            <Bone x={x} yBottom={KNEE} yTop={HIP} rBottom={b.limbR} rTop={b.limbR * 1.25} color={bottom.color} />
          )}
          {/* pantorrilla (rodilla sin esfera: los cilindros empalman al mismo radio) */}
          <Bone x={x} yBottom={ANKLE} yTop={KNEE} rBottom={shinBotR} rTop={b.limbR} color={shinColor} />
          {bs.tapered && <Joint x={x} y={ANKLE + 0.02} r={shinBotR * 1.25} color={bottom.color} scale={[1, 0.5, 1]} />}
          <Shoe x={x} part={shoes.part} color={shoes.color} />
        </group>
      ))}

      {/* ── Cadera + torso (achatado en Z) ── */}
      <group scale={[1, 1, torsoFlatten]}>
        {/* pelvis (prenda inferior) */}
        <Bone yBottom={HIP - 0.04} yTop={WAIST} rBottom={b.hipR} rTop={b.waistR * 1.1} color={bottom.color} />
        {/* torso ahusado cintura→hombros (prenda superior) */}
        <Bone yBottom={WAIST} yTop={SHOULDER} rBottom={b.waistR} rTop={b.shoulderR} color={top.color} />
      </group>

      {/* pecho femenino: una sola pieza (repisa ancha y suave al frente), no dos círculos */}
      {b.bust && (
        <Joint y={1.34} z={b.waistR * 0.9} r={0.1} color={top.color} scale={[1.7, 0.55, 0.75]} />
      )}

      {/* ── Brazos + hombro sobre el brazo (deltoides) ── */}
      {[-1, 1].map((s) => {
        const x = s * shoulderX;
        const sleeveTop = ts.upperArm ? top.color : SKIN;
        const sleeveFore = ts.foreArm ? top.color : SKIN;
        return (
          <group key={`arm-${s}`}>
            {/* hombro: esfera arriba del brazo, como en la vida real */}
            <Joint x={x} y={SHOULDER - 0.01} r={b.limbR * 1.25} color={sleeveTop} />
            {/* brazo (codo sin esfera: empalme de radios) */}
            <Bone x={x} yBottom={elbow} yTop={SHOULDER} rBottom={b.limbR * 0.85} rTop={b.limbR} color={sleeveTop} />
            <Bone x={x} yBottom={wrist} yTop={elbow} rBottom={b.limbR * 0.7} rTop={b.limbR * 0.85} color={sleeveFore} />
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
        <mesh key={`eye-${x}`} position={[x, EYE_Y, HEAD_R * 0.86]}>
          <boxGeometry args={[0.04, 0.04, 0.02]} />
          <meshStandardMaterial color={EYE} />
        </mesh>
      ))}

      {/* ── Pelo (siempre por encima de los ojos) ── */}
      <HairMesh part={hair.part} color={hair.color} />
    </group>
  );
}

interface HairMeshProps {
  part: string;
  color: string;
}

/**
 * Pelo como casquete esférico a radio mayor que la cabeza → no traspasa. El `thetaLength`
 * se acota para que el nacimiento del pelo quede **por encima de los ojos** (cualquier estilo).
 */
function HairMesh({ part, color }: HairMeshProps) {
  if (part === "none") return null;
  const mat = <meshStandardMaterial color={color} flatShading />;
  const r = HEAD_R + 0.02;
  const HAIRLINE = Math.PI / 2.7; // ~1.16 rad: frente del casquete por encima de los ojos

  switch (part) {
    case "buzz":
      return (
        <mesh position={[0, HEAD_CY, 0]} scale={[0.92, 1.12, 1]}>
          <sphereGeometry args={[HEAD_R + 0.006, 8, 6, 0, Math.PI * 2, 0, HAIRLINE]} />
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
            <sphereGeometry args={[r, 8, 6, 0, Math.PI * 2, 0, HAIRLINE]} />
            {mat}
          </mesh>
          {/* casquete trasero (nuca) + rodete */}
          <mesh position={[0, HEAD_CY - 0.02, -0.02]} scale={[0.95, 1.05, 1]}>
            <sphereGeometry args={[r, 8, 6, 0, Math.PI * 2, Math.PI * 0.55, Math.PI * 0.45]} />
            {mat}
          </mesh>
          <Joint y={HEAD_CY + HEAD_R * 0.9} z={-HEAD_R} r={0.07} color={color} />
        </group>
      );
    case "long":
      return (
        <group>
          <mesh position={[0, HEAD_CY, 0]} scale={[0.98, 1.12, 1]}>
            <sphereGeometry args={[r, 8, 6, 0, Math.PI * 2, 0, HAIRLINE]} />
            {mat}
          </mesh>
          {/* lados + melena por la espalda */}
          <mesh position={[0, HEAD_CY - 0.05, -0.04]} scale={[1.02, 1.1, 1]}>
            <sphereGeometry args={[r, 8, 6, 0, Math.PI * 2, Math.PI * 0.5, Math.PI * 0.5]} />
            {mat}
          </mesh>
          <mesh position={[0, HEAD_CY - 0.24, -HEAD_R * 0.7]}>
            <boxGeometry args={[0.22, 0.36, 0.06]} />
            {mat}
          </mesh>
        </group>
      );
    case "short":
    default:
      return (
        <group>
          <mesh position={[0, HEAD_CY, 0]} scale={[0.96, 1.12, 1]}>
            <sphereGeometry args={[r, 8, 6, 0, Math.PI * 2, 0, HAIRLINE]} />
            {mat}
          </mesh>
          {/* casquete trasero para cubrir la nuca */}
          <mesh position={[0, HEAD_CY - 0.02, -0.02]} scale={[0.96, 1.06, 1]}>
            <sphereGeometry args={[r, 8, 6, 0, Math.PI * 2, Math.PI * 0.5, Math.PI * 0.5]} />
            {mat}
          </mesh>
        </group>
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
    const studXs = [-0.035, 0.035];
    const studZs = [-0.06, 0.02, 0.1];
    return (
      <group>
        {/* empeine */}
        <mesh position={[x, 0.07, 0.04]}>
          <boxGeometry args={[0.11, 0.07, 0.22]} />
          <meshStandardMaterial color={color} flatShading />
        </mesh>
        {/* puntera más baja y larga */}
        <mesh position={[x, 0.045, 0.13]}>
          <boxGeometry args={[0.1, 0.05, 0.12]} />
          <meshStandardMaterial color={color} flatShading />
        </mesh>
        {/* suela */}
        <mesh position={[x, 0.025, 0.06]}>
          <boxGeometry args={[0.12, 0.025, 0.32]} />
          <meshStandardMaterial color="#1d1d1d" flatShading />
        </mesh>
        {/* tapones */}
        {studXs.map((sx) =>
          studZs.map((sz) => (
            <mesh key={`stud-${sx}-${sz}`} position={[x + sx, 0.0, 0.06 + sz]}>
              <cylinderGeometry args={[0.014, 0.011, 0.03, 5]} />
              <meshStandardMaterial color="#111111" flatShading />
            </mesh>
          )),
        )}
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
