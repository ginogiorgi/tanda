"use client";

/**
 * ¿Están los GLB de estos cuerpos? Liviano (no trae three: importa `glbLoad` recién al usarse) → lo usan
 * los viewers para decidir qué mostrar ANTES de montar el canvas: placeholder neutro mientras carga,
 * error con reintento si falla, la escena cuando está todo (feedback 2, P2.1: nunca otro muñeco).
 */
import { useCallback, useEffect, useState } from "react";
import type { BodyType } from "@/lib/avatar/types";

export type GlbStatus = "loading" | "ready" | "error";

export function useGlbReady(bodies: readonly BodyType[]): { status: GlbStatus; retry: () => void } {
  const key = [...new Set(bodies)].sort().join(",");
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ key: string; attempt: number; ok: boolean } | null>(null);

  useEffect(() => {
    let alive = true;
    const wanted = key.split(",").filter(Boolean) as BodyType[];
    import("./glbLoad")
      .then((m) => m.loadGlbBodies(wanted))
      .then(
        () => alive && setResult({ key, attempt, ok: true }),
        () => alive && setResult({ key, attempt, ok: false }),
      );
    return () => {
      alive = false;
    };
  }, [key, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  const current = result && result.key === key && result.attempt === attempt;
  return { status: !current ? "loading" : result.ok ? "ready" : "error", retry };
}
