/**
 * Datos estructurados JSON-LD (D1) para la landing: `VideoGame` + `WebSite` + `Organization` (Pyrux)
 * + `FAQPage` (rich results), encadenados en un `@graph`. Mejora cómo entienden el sitio Google y los
 * previews. Server Component
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
      {
        "@type": "FAQPage",
        "@id": `${site}/#faq`,
        mainEntity: [
          {
            "@type": "Question",
            name: "¿Qué es Tanda?",
            acceptedAnswer: {
              "@type": "Answer",
              text: "Tanda es un juego de trivia mundialista multijugador en tiempo real. Cada pregunta es un penal: si respondés bien y más rápido que tu rival, metés el gol o atajás. Avanzás de la fase de grupos hasta la final.",
            },
          },
          {
            "@type": "Question",
            name: "¿Es gratis?",
            acceptedAnswer: {
              "@type": "Answer",
              text: "Sí, Tanda es gratis y se juega desde el navegador, sin descargar nada.",
            },
          },
          {
            "@type": "Question",
            name: "¿Necesito crear una cuenta para jugar?",
            acceptedAnswer: {
              "@type": "Answer",
              text: "No. Podés entrar como invitado y jugar al instante. Si creás una cuenta, además guardás tu avatar a medida, tu historial y tus estadísticas.",
            },
          },
          {
            "@type": "Question",
            name: "¿Contra quién juego?",
            acceptedAnswer: {
              "@type": "Answer",
              text: "Jugás partidas en tiempo real contra otras personas. Cuando falta gente, completan jugadores controlados por la máquina, así nunca esperás para arrancar.",
            },
          },
        ],
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
