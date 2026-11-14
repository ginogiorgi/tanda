import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";

/**
 * Imagen de preview social (Open Graph / Twitter) del rebrand "B · Programa": tapa de programa de
 * partido impreso — papel, tinta, wordmark TANDA en Big Shoulders Black con el sello rojo. Sin assets
 * externos: la fuente vive en `assets/fonts` (OFL). 1200×630 = estándar.
 */
export const alt = "Tanda — Trivia de penales en tiempo real";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const PAPER = "#EDE9DF";
const INK = "#141414";
const RED = "#D7261E";
const BLUE = "#1F3FA8";

export default async function OpengraphImage() {
  const display = await readFile(join(process.cwd(), "assets/fonts/BigShouldersDisplay-Black.ttf"));

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          padding: 28,
          background: PAPER,
        }}
      >
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            border: `6px solid ${INK}`,
            padding: "40px 56px",
            color: INK,
            fontFamily: "Big Shoulders",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: 34,
              letterSpacing: 6,
              borderTop: `8px solid ${INK}`,
              borderBottom: `3px solid ${INK}`,
              padding: "10px 0",
            }}
          >
            <span style={{ color: RED }}>TRIVIA DE PENALES · EN VIVO</span>
            <span>Nº 26</span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 36 }}>
            <span style={{ fontSize: 260, lineHeight: 0.8, letterSpacing: 2 }}>TANDA</span>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                width: 170,
                height: 170,
                borderRadius: 9999,
                border: `12px solid ${RED}`,
                color: RED,
                fontSize: 60,
                lineHeight: 0.9,
                transform: "rotate(-12deg)",
              }}
            >
              <span>TA</span>
              <span>26</span>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 20, fontSize: 40, letterSpacing: 2, whiteSpace: "nowrap" }}>
            <span style={{ background: RED, color: "#fff", padding: "4px 18px" }}>MUNDIAL</span>
            <span style={{ background: BLUE, color: "#fff", padding: "4px 18px" }}>FÚTBOL ARGENTINO</span>
            <span>CADA PREGUNTA ES UN PENAL</span>
          </div>
        </div>
      </div>
    ),
    { ...size, fonts: [{ name: "Big Shoulders", data: display, weight: 900, style: "normal" }] },
  );
}
