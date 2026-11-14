import type { NextConfig } from "next";
import bundleAnalyzer from "@next/bundle-analyzer";

// CSP completa en modo Report-Only: no rompe nada, sólo reporta violaciones en consola para
// poder validar y luego pasar a enforcing. Permite Supabase (REST + realtime por wss) y los
// blobs/data que usa three/R3F. `frame-ancestors 'none'` sí va enforced (abajo) porque sólo
// afecta el embebido en iframes y es justo lo que queremos bloquear (anti-clonado/clickjacking).
const reportOnlyCsp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'", // wasm: decoder meshopt de los GLB del avatar
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
  "worker-src 'self' blob:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

// Headers de seguridad aplicados a todas las rutas servidas por Vercel/Next.
const securityHeaders = [
  // Anti-clickjacking / anti-embebido: nadie puede meter Tanda en un iframe en otro dominio.
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "Content-Security-Policy-Report-Only", value: reportOnlyCsp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), browsing-topics=()",
  },
];

const nextConfig: NextConfig = {
  // Que el TS legible no se reconstruya desde prod. Ya es el default; lo dejamos explícito.
  productionBrowserSourceMaps: false,
  // La imagen OG lee la fuente del wordmark desde disco: que viaje en el bundle de la función.
  outputFileTracingIncludes: { "/opengraph-image": ["./assets/fonts/**"] },
  // Tree-shaking dirigido para libs con muchos sub-imports. three/R3F ya van por `next/dynamic`
  // (PenalSceneViewer / AvatarViewer), así que no entran al bundle inicial.
  experimental: {
    optimizePackageImports: ["three", "@react-three/fiber"],
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

// `ANALYZE=true pnpm build` abre el reporte de tamaño de bundles.
const withBundleAnalyzer = bundleAnalyzer({ enabled: process.env.ANALYZE === "true" });

export default withBundleAnalyzer(nextConfig);
