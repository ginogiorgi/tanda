import { useMemo } from "react";
import * as THREE from "three";

/**
 * Textura radial (centro oscuro → transparente) para sombras de contacto falsas: un plano con esto
 * bajo los pies reemplaza a los shadow maps (barato en mobile). Se crea una vez por componente.
 */
export function useBlobTexture(rgb = "20,20,20", alpha = 0.55): THREE.Texture | null {
  return useMemo(() => {
    if (typeof document === "undefined") return null;
    const cv = document.createElement("canvas");
    cv.width = cv.height = 64;
    const ctx = cv.getContext("2d");
    if (!ctx) return null;
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, `rgba(${rgb},${alpha})`);
    g.addColorStop(0.6, `rgba(${rgb},${alpha * 0.33})`);
    g.addColorStop(1, `rgba(${rgb},0)`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }, [rgb, alpha]);
}
