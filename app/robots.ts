import type { MetadataRoute } from "next";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://tanda2026.com.ar";

/**
 * robots.txt: indexable salvo las rutas privadas/de juego (no aportan a SEO y cambian por usuario).
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/partido", "/sala/", "/perfil", "/avatar", "/auth/"],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
