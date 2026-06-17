"use client";

import { useSyncExternalStore } from "react";

/**
 * `prefers-reduced-motion: reduce` como booleano reactivo. El bloque global de globals.css ya
 * neutraliza las animaciones CSS, pero el render WebGL (R3F/useFrame de la escena de penal) corre
 * fuera del CSS → necesita consultarse en JS para saltear la animación procedural (9.3, SPEC §9).
 *
 * Usa `useSyncExternalStore` (SSR-safe: snapshot de servidor `false`; se suscribe a los cambios del
 * media query en el cliente) → sin setState-en-effect.
 */
const QUERY = "(prefers-reduced-motion: reduce)";

function subscribe(onChange: () => void): () => void {
  if (typeof window === "undefined" || !window.matchMedia) return () => {};
  const mq = window.matchMedia(QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

function getSnapshot(): boolean {
  return typeof window !== "undefined" && !!window.matchMedia
    ? window.matchMedia(QUERY).matches
    : false;
}

export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}
