import { ImageResponse } from "next/og";

/**
 * Imagen de preview social (Open Graph / Twitter) generada on-brand con `next/og` — sin assets
 * externos (coherente con "assets originales", SPEC §8.2). Es lo que se ve al compartir el link
 * por WhatsApp / redes. 1200×630 = tamaño estándar.
 */
export const alt = "Tanda — Trivia Mundialista en tiempo real";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const ACCENTS = ["#3b82f6", "#22e06b", "#ef4444", "#d946ef", "#f97316", "#14b8a6"];

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "#0a0a0a",
          color: "#ffffff",
          fontFamily: "sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            fontSize: 22,
            letterSpacing: 12,
            textTransform: "uppercase",
            color: "#71717a",
            marginBottom: 28,
          }}
        >
          Mundial · Trivia · Tiempo real
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 200,
            fontWeight: 800,
            letterSpacing: -4,
            color: "#d4af37",
            lineHeight: 1,
          }}
        >
          TANDA
        </div>
        <div
          style={{
            display: "flex",
            gap: 16,
            marginTop: 40,
            marginBottom: 36,
          }}
        >
          {ACCENTS.map((c) => (
            <div key={c} style={{ width: 18, height: 18, borderRadius: 9999, background: c }} />
          ))}
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 34,
            color: "#a1a1aa",
            maxWidth: 880,
            textAlign: "center",
          }}
        >
          Cada pregunta es un penal. Respondé bien y más rápido para meter el gol.
        </div>
      </div>
    ),
    { ...size },
  );
}
