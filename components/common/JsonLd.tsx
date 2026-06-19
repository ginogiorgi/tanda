/**
 * Datos estructurados JSON-LD (D1) para la landing: `VideoGame` + `WebSite` + `Organization` (Pyrux),
 * encadenados en un `@graph`. Mejora cómo entienden el sitio Google y los previews. Server Component
 * (sin estado): emite un `<script type="application/ld+json">` con el grafo. URL canónica desde
 * `canonicalSiteUrl()` (misma fuente que metadataBase/sitemap/robots — A2/D3).
 */

import { canonicalSiteUrl } from "@/lib/env";

const PYRUX_URL = "https://www.pyrux.com.ar";

export function JsonLd() {
  const site = canonicalSiteUrl();
  const description =
    "Trivia de Mundiales en tiempo real. Cada pregunta es un penal: respondé bien y más rápido que tu rival para meter el gol o atajar. 48 selecciones, una sola copa.";

  const graph = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${PYRUX_URL}/#organization`,
        name: "Pyrux",
        url: PYRUX_URL,
        sameAs: [
          "https://www.instagram.com/pyrux_labs",
          "https://linkedin.com/company/pyrux",
        ],
      },
      {
        "@type": "WebSite",
        "@id": `${site}/#website`,
        url: site,
        name: "Tanda",
        description,
        inLanguage: "es-AR",
        publisher: { "@id": `${PYRUX_URL}/#organization` },
      },
      {
        "@type": "VideoGame",
        "@id": `${site}/#game`,
        name: "Tanda",
        url: site,
        description,
        inLanguage: "es-AR",
        genre: ["Trivia", "Deportes"],
        gamePlatform: "Web browser",
        applicationCategory: "GameApplication",
        operatingSystem: "Web",
        playMode: "MultiPlayer",
        publisher: { "@id": `${PYRUX_URL}/#organization` },
        offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
      },
    ],
  };

  return (
    <script
      type="application/ld+json"
      // JSON-LD generado en server desde constantes (sin input de usuario) → seguro.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(graph) }}
    />
  );
}
