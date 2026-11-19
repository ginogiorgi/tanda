/**
 * Papelitos del campeón (feedback 3, #6): capa de FONDO, detrás del resultado y los botones. Cada
 * papelito se tira desde una tribuna (borde de la pantalla) hacia adentro y queda tirado en el pasto:
 * su estilo base ES la posición final y el keyframe `tanda-confetti-in` (globals.css) solo trae el
 * vuelo (`from` = afuera, vía `--dx/--dy`, `fill-mode: both`, una sola vez). Con reduced motion no hay
 * vuelo: quedan quietos en su lugar.
 *
 * Capa `fixed inset-0 -z-[1]`: dentro del contenedor del resultado pinta debajo de su contenido y
 * arriba de `PitchBackground` (`-z-10`). Caen cerca de las bandas y una máscara vacía la columna central
 * (en celu, todo salvo los costados) para que el resultado y los botones se lean sobre papel limpio. Deterministas (derivados del índice,
 * sin Math.random → misma salida en SSR e hidratación). Sin interactividad → Server Component.
 */

import type { CSSProperties } from "react";

const COLORS = ["bg-brand", "bg-blue", "bg-ink", "bg-bg-elevated", "bg-success", "bg-accent-orange"] as const;

type Edge = "left" | "right" | "top" | "bottom";

/** Pseudoaleatorio entero → [0, 1) estable por (índice, canal). */
function rand(i: number, k: number): number {
  const x = Math.imul(i + 1, 2654435761) ^ Math.imul(k + 7, 40503);
  return ((x >>> 0) % 10007) / 10007;
}

export type ConfettiPiece = {
  /** Posición final en el pasto, en % del viewport. */
  x: number;
  y: number;
  /** Tribuna desde la que se tira. */
  edge: Edge;
  /** Giro final y giro de salida (grados). */
  rot: number;
  rot0: number;
  /** Tamaño del papelito (rem). */
  w: number;
  h: number;
  delay: number;
  duration: number;
  color: (typeof COLORS)[number];
};

/** Arma `count` papelitos. Puro y estable (lo testea `Confetti.test`). */
export function confettiPieces(count: number): ConfettiPiece[] {
  return Array.from({ length: count }, (_, i) => {
    // Caen cerca de la banda de su tribuna (más densos contra el borde): el centro queda para el resultado.
    const fromEdge = Math.pow(rand(i, 1), 1.6) * 46;
    const x = i % 2 === 0 ? 2 + fromEdge : 98 - fromEdge;
    const y = 4 + rand(i, 2) * 92;
    // Desde la tribuna más cercana (laterales casi siempre; algunas desde arriba/abajo).
    const side = rand(i, 3);
    const edge: Edge = side < 0.12 ? "top" : side < 0.2 ? "bottom" : x < 50 ? "left" : "right";
    const rot = Math.round(rand(i, 4) * 360);
    return {
      x,
      y,
      edge,
      rot,
      rot0: rot - 540 + Math.round(rand(i, 5) * 360),
      w: 0.45 + rand(i, 6) * 0.35,
      h: 0.28 + rand(i, 7) * 0.2,
      delay: Math.round(rand(i, 8) * 16) / 10,
      duration: 1.1 + Math.round(rand(i, 9) * 8) / 10,
      color: COLORS[i % COLORS.length]!,
    };
  });
}

/** Desplazamiento de salida: desde fuera del borde de su tribuna hasta el lugar final. */
function offset(p: ConfettiPiece): { dx: string; dy: string } {
  const drift = (p.y - 50) * 0.3; // vuela en diagonal suave, no en línea recta
  switch (p.edge) {
    case "left":
      return { dx: `calc(-${p.x.toFixed(1)}vw - 8vw)`, dy: `${(-drift).toFixed(1)}vh` };
    case "right":
      return { dx: `calc(${(100 - p.x).toFixed(1)}vw + 8vw)`, dy: `${(-drift).toFixed(1)}vh` };
    case "top":
      return { dx: `${((p.x - 50) * -0.2).toFixed(1)}vw`, dy: `calc(-${p.y.toFixed(1)}vh - 8vh)` };
    case "bottom":
      return { dx: `${((p.x - 50) * -0.2).toFixed(1)}vw`, dy: `calc(${(100 - p.y).toFixed(1)}vh + 8vh)` };
  }
}

const PIECES = confettiPieces(90);

export function Confetti() {
  return (
    <div
      data-layer="bg"
      data-testid="confetti"
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-[1] overflow-hidden [mask-image:linear-gradient(90deg,#000_7%,transparent_14%,transparent_86%,#000_93%)] sm:[mask-image:linear-gradient(90deg,#000_calc(50%-19rem),transparent_calc(50%-15rem),transparent_calc(50%+15rem),#000_calc(50%+19rem))]"
    >
      {PIECES.map((p, i) => {
        const { dx, dy } = offset(p);
        return (
          <span
            key={i}
            className={`confetti-piece ${p.color}`}
            style={
              {
                left: `${p.x.toFixed(2)}%`,
                top: `${p.y.toFixed(2)}%`,
                width: `${p.w.toFixed(2)}rem`,
                height: `${p.h.toFixed(2)}rem`,
                animationDelay: `${p.delay}s`,
                animationDuration: `${p.duration}s`,
                "--dx": dx,
                "--dy": dy,
                "--r": `${p.rot}deg`,
                "--r0": `${p.rot0}deg`,
              } as CSSProperties
            }
          />
        );
      })}
    </div>
  );
}
