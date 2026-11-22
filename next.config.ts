import type { NextConfig } from "next";
import bundleAnalyzer from "@next/bundle-analyzer";
import { withSentryConfig } from "@sentry/nextjs/config";

// CSP ENFORCED (antes Report-Only; validada con los e2e + /dev/avatar y /dev/penal, 0 violaciones).
// - connect-src: SOLO el Supabase del build (REST + realtime por ws/wss), derivado de la env → en prod el
//   proyecto, en el e2e el local. `blob:` porque GLTFLoader pide por fetch las texturas embebidas en los GLB.
// - script-src: 'unsafe-inline' por los scripts inline de Next (sin nonce: forzaría render dinámico en
//   todo); 'wasm-unsafe-eval' para el decoder meshopt de los GLB (WebAssembly, no habilita eval de JS);
//   'unsafe-eval' SOLO en `next dev` (HMR/React Refresh lo necesitan).
// - img/worker con blob:/data: por three/R3F.
function supabaseOrigins(): string[] {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!raw) return ["https://*.supabase.co", "wss://*.supabase.co"];
  const u = new URL(raw);
  return [u.origin, `${u.protocol === "https:" ? "wss:" : "ws:"}//${u.host}`];
}

const isDev = process.env.NODE_ENV === "development";

const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  `connect-src 'self' blob: ${supabaseOrigins().join(" ")}`,
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
  { key: "Content-Security-Policy", value: csp },
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

const config = withBundleAnalyzer(nextConfig);

// Sentry (feedback 4 F) SOLO en los builds de Vercel: sube los source maps (stacks legibles en Sentry) y
// los borra del output, así no se publican. En local y en CI el config queda intacto.
export default process.env.VERCEL === "1"
  ? withSentryConfig(config, {
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      authToken: process.env.SENTRY_AUTH_TOKEN,
      silent: true,
      telemetry: false,
      sourcemaps: { deleteSourcemapsAfterUpload: true },
      // El mapa de rutas sirve para agrupar trazas (no usamos) y pesaba en cada ruta.
      routeManifestInjection: false,
    })
  : config;
