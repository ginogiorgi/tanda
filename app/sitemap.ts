import type { MetadataRoute } from "next";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://tanda2026.com.ar";

/** Sitemap: solo las páginas públicas (las de juego son privadas y por usuario). */
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return ["/", "/login", "/register"].map((path) => ({
    url: `${SITE_URL}${path}`,
    lastModified: now,
    changeFrequency: "monthly",
    priority: path === "/" ? 1 : 0.5,
  }));
}
