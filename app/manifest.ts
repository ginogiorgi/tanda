import type { MetadataRoute } from "next";

/**
 * Web App Manifest (PWA): permite "agregar a pantalla de inicio" en mobile con identidad de app
 * (nombre, color, pantalla completa). Mobile-first, así que vale para el lanzamiento. El ícono lo
 * genera `app/icon.tsx` (servido en `/icon`).
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
      { src: "/icon", sizes: "512x512", type: "image/png" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png" },
    ],
  };
}
