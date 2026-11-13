import type { MetadataRoute } from "next";

/**
 * Web App Manifest (PWA): permite "agregar a pantalla de inicio" en mobile con identidad de app
 * (nombre, color, pantalla completa). Mobile-first, así que vale para el lanzamiento. Íconos estáticos
 * derivados de `app/icon.svg` (el favicon lo sirve Next desde `app/`).
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Tanda — Trivia Mundialista",
    short_name: "Tanda",
    description:
      "Trivia de Mundiales en tiempo real. Cada pregunta es un penal: respondé bien y más rápido para meter el gol.",
    start_url: "/",
    display: "standalone",
    background_color: "#0a0a0a",
    theme_color: "#0a0a0a",
    lang: "es-AR",
    categories: ["games", "sports", "trivia"],
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
    ],
  };
}
