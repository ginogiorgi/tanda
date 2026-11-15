"use client";

/**
 * Confeti del campeón (8.12): piezas absolutas que caen con el keyframe `tanda-confetti`
 * (globals.css). Posiciones/colores/tiempos deterministas (no Math.random en SSR/hidratación: se
 * derivan del índice). Lo neutraliza `prefers-reduced-motion` por CSS.
 */

import { useMemo } from "react";

const COLORS = ["#d7261e", "#1f3fa8", "#141414", "#f7f4ec", "#1d7a3e", "#d8661c"];

export function Confetti({ count = 40 }: { count?: number }) {
  const pieces = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        left: (i * 97) % 100,
        delay: (i % 10) * 0.35,
        duration: 2.6 + ((i * 7) % 20) / 10,
        color: COLORS[i % COLORS.length]!,
      })),
    [count],
  );

  return (
    <div data-layer="overlay" className="pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden>
      {pieces.map((p, i) => (
        <span
          key={i}
          className="confetti-piece"
          style={{
            left: `${p.left}%`,
            backgroundColor: p.color,
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.duration}s`,
          }}
        />
      ))}
    </div>
  );
}
