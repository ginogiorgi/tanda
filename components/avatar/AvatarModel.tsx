/**
 * Avatar low-poly humano (estilo "malla decimada", facetado pero orgánico) compuesto por
 * primitivas a partir de un {@link AvatarConfig}. Sin assets externos. Mira hacia +Z (cámara
 * en +Z): la cara (nariz + ojos) marca el frente para que la rotación se note. Proporciones
 * ~7 cabezas. Dos cuerpos con **silueta característica** (hombre en V, mujer reloj de arena)
 * vía radios distintos, no solo escala. Ver SPEC §8.2.
 */

import type { AvatarConfig, BodyType, HexColor } from "@/lib/avatar/types";

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
const EYE_Y = HEAD_CY + 0.005; // cara un poco más abajo → más lugar para el pelo arriba

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
  female: { scale: 0.93, shoulderR: 0.17, waistR: 0.112, hipR: 0.185, limbR: 0.055, bust: true },
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
  /**
   * Override del color de camiseta (SPEC §8.3 #1): en la escena de penal el `top` se tiñe con el
   * `kit_primary` de la nación. Si no viene, se usa el `top.color` del avatar (creador/perfil).
   */
  kitTop?: HexColor;
  /**
   * Color de la banda diagonal cruzada de la remera (`kit_secondary`). Estilización del juego para
   * diferenciar selecciones de color parecido. Si falta o es igual a `kitTop`, no se dibuja banda
   * (remera lisa). Solo aplica en la escena de penal (junto con `kitTop`), no en el creador.
   */
  kitSash?: HexColor;
}

export function AvatarModel({ config, kitTop, kitSash }: AvatarModelProps) {
  const { bodyType, hair, bottom, shoes } = config;
  const top = kitTop ? { ...config.top, color: kitTop } : config.top;
  const sashColor = kitTop && kitSash && kitSash !== top.color ? kitSash : null;
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
          <Shoe x={x} part={shoes.part} color={shoes.color} limbR={b.limbR} />
        </group>
      ))}

      {/* ── Cadera + torso (achatado en Z) ── */}
      <group scale={[1, 1, torsoFlatten]}>
        {/* pelvis (prenda inferior) */}
        <Bone yBottom={HIP - 0.04} yTop={WAIST} rBottom={b.hipR} rTop={b.waistR * 1.1} color={bottom.color} />
        {/* torso ahusado cintura→hombros (prenda superior) */}
        <Bone yBottom={WAIST} yTop={SHOULDER} rBottom={b.waistR} rTop={b.shoulderR} color={top.color} />
      </group>

      {/* pecho femenino: un polígono del torso levantado a la altura del busto (no un óvalo) */}
      {b.bust && (
        <mesh position={[0, 1.36, b.shoulderR * 0.42]} rotation={[-0.5, 0, 0]}>
          <boxGeometry args={[b.shoulderR * 1.5, 0.16, 0.12]} />
          <meshStandardMaterial color={top.color} flatShading />
        </mesh>
      )}

      {/* banda diagonal cruzada (kit_secondary): slab fino al frente del pecho, de hombro a cadera */}
      {sashColor && <Sash color={sashColor} body={b} />}

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
      <mesh position={[0, HEAD_CY - 0.045, HEAD_R * 0.92]}>
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

/**
 * Banda diagonal cruzada de la remera (la "raya cruzada"): un slab fino apoyado al frente del torso,
 * de un hombro a la cadera opuesta. Sigue el achatado en Z del torso para apoyarse sobre el pecho y
 * se dimensiona con la silueta del cuerpo (vale para hombre/mujer). Low-poly, sin texturas.
 */
function Sash({ color, body }: { color: string; body: BodyShape }) {
  const yMid = (WAIST + SHOULDER) / 2 + 0.02;
  const rMid = (body.waistR + body.shoulderR) / 2;
  const flatten = body.bust ? 0.82 : 0.72; // mismo achatado que el torso
  const z = rMid * flatten * 0.95; // apoyada sobre la superficie frontal del pecho
  const width = body.shoulderR * 0.5;
  const length = SHOULDER - WAIST + body.shoulderR * 1.5;
  return (
    <mesh position={[0, yMid, z]} rotation={[-0.08, 0, 0.92]}>
      <boxGeometry args={[width, length, 0.03]} />
      <meshStandardMaterial color={color} flatShading />
    </mesh>
  );
}

interface HairMeshProps {
  part: string;
  color: string;
}

/**
 * Pelo que **abraza el cráneo** (no flota): un casquete con el MISMO centro y escala que la cabeza y
 * radio apenas mayor (cáscara fina) → sigue la curvatura en X/Y/Z, sin el borde despegado de los
 * lados. Más segmentos = borde prolijo. El nacimiento queda por encima de los ojos en todos los
 * estilos; las masas (cresta, rodete, melena) nacen pegadas al cuero cabelludo, no como piezas sueltas.
 */
// La cabeza es una esfera de radio HEAD_R escalada así (más angosta en X, más alta en Y).
const HEAD_SCALE: [number, number, number] = [0.92, 1.12, 1];

function HairMesh({ part, color }: HairMeshProps) {
  if (part === "none") return null;
  const mat = <meshStandardMaterial color={color} flatShading />;

  // Cáscara que sigue el cráneo: mismo centro/escala que la cabeza, radio = HEAD_R + `extra` (fino).
  // `hairline` = cuánto baja el casquete desde la coronilla (más chico = nace más arriba). π/2.35 deja
  // el nacimiento por encima de los ojos sin tapar la cara.
  const shell = (extra: number, hairline: number) => (
    <mesh position={[0, HEAD_CY, 0]} scale={HEAD_SCALE}>
      <sphereGeometry args={[HEAD_R + extra, 12, 8, 0, Math.PI * 2, 0, hairline]} />
      {mat}
    </mesh>
  );
  const cap = shell(0.012, Math.PI / 2.35);

  switch (part) {
    case "buzz":
      // Rapado: cáscara finita bien pegada al cráneo.
      return shell(0.005, Math.PI / 2.3);
    case "mohawk":
      return (
        <group>
          {/* base rapada a los costados */}
          {shell(0.004, Math.PI / 2.35)}
          {/* cresta central que NACE de la coronilla (caja fina a lo largo de Z, anclada al cuero) */}
          <mesh position={[0, HEAD_CY + HEAD_R * 0.9, -0.005]} scale={[1, 1.18, 1]}>
            <boxGeometry args={[0.055, 0.13, 0.26]} />
            {mat}
          </mesh>
        </group>
      );
    case "bun":
      return (
        <group>
          {cap}
          {/* rodete pegado a la nuca-coronilla */}
          <Joint y={HEAD_CY + HEAD_R * 0.9} z={-HEAD_R * 0.72} r={0.062} color={color} />
        </group>
      );
    case "long":
      return (
        <group>
          {cap}
          {/* melena que cae por detrás, clavada a la nuca (sólo -Z, no envuelve la cara) */}
          <mesh position={[0, HEAD_CY - 0.13, -HEAD_R * 0.86]} scale={[1.05, 1, 1]}>
            <boxGeometry args={[0.23, 0.3, 0.07]} />
            {mat}
          </mesh>
        </group>
      );
    case "short":
    default:
      return cap;
  }
}

/** Zapato diferenciado por tipo. Puntera hacia +Z. */
function Shoe({ x, part, color, limbR }: { x: number; part: string; color: string; limbR: number }) {
  if (part === "boots") {
    const shaftR = Math.max(0.088, limbR * 1.35); // siempre más ancho que la pierna → se ve la caña
    return (
      <group>
        {/* caña sobre la pierna (lo que los destaca) */}
        <mesh position={[x, 0.2, -0.01]}>
          <cylinderGeometry args={[shaftR * 0.92, shaftR, 0.28, SEG]} />
          <meshStandardMaterial color={color} flatShading />
        </mesh>
        {/* pie */}
        <mesh position={[x, 0.05, 0.06]}>
          <boxGeometry args={[shaftR * 1.6, 0.1, 0.28]} />
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
