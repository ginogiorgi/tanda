import type { ReactElement } from "react";

/**
 * "T" de marca (dorada sobre negro) refinada, generada on-brand sin assets externos. Compartida por
 * el favicon (`app/icon`) y el apple-icon para que no se desincronicen (T2). El "detalle sutil" es un
 * glow dorado radial detrás de la T + una línea de cancha debajo (evoca la línea del penal), con peso
 * y tracking más cuidados que la "T" plana anterior. Escala todo a partir del lado `px`.
 */
export function brandIcon(px: number): ReactElement {
  const lineHeight = Math.max(2, Math.round(px * 0.03));
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#0a0a0a",
        backgroundImage:
          "radial-gradient(circle at 50% 44%, rgba(212,175,55,0.22), rgba(212,175,55,0) 62%)",
      }}
    >
      <div
        style={{
          display: "flex",
          fontSize: Math.round(px * 0.66),
          fontWeight: 700,
          fontFamily: "sans-serif",
          lineHeight: 1,
          color: "#d4af37",
        }}
      >
        T
      </div>
      <div
        style={{
          marginTop: Math.round(px * 0.045),
          width: Math.round(px * 0.34),
          height: lineHeight,
          borderRadius: lineHeight,
          backgroundImage:
            "linear-gradient(90deg, rgba(212,175,55,0) 0%, #d4af37 50%, rgba(212,175,55,0) 100%)",
        }}
      />
    </div>
  );
}
