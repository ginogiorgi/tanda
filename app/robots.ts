import type { MetadataRoute } from "next";
import { canonicalSiteUrl } from "@/lib/env";

const SITE_URL = canonicalSiteUrl();

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
