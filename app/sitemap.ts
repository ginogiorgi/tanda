import type { MetadataRoute } from "next";
import { canonicalSiteUrl } from "@/lib/env";

const SITE_URL = canonicalSiteUrl();

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
