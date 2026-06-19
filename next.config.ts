import type { NextConfig } from "next";
import bundleAnalyzer from "@next/bundle-analyzer";

const nextConfig: NextConfig = {
  // Tree-shaking dirigido para libs con muchos sub-imports. three/R3F ya van por `next/dynamic`
  // (PenalSceneViewer / AvatarViewer), así que no entran al bundle inicial.
  experimental: {
    optimizePackageImports: ["three", "@react-three/fiber"],
  },
};

// `ANALYZE=true pnpm build` abre el reporte de tamaño de bundles.
const withBundleAnalyzer = bundleAnalyzer({ enabled: process.env.ANALYZE === "true" });

export default withBundleAnalyzer(nextConfig);
