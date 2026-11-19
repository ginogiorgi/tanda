import type { Metadata, Viewport } from "next";
import { Big_Shoulders, Instrument_Sans } from "next/font/google";
import { canonicalSiteUrl } from "@/lib/env";
import { Footer } from "@/components/ui/Footer";
import { PitchBackground } from "@/components/ui/PitchBackground";
import "./globals.css";

// Rebrand "B · Programa": Instrument Sans para leer (UI, preguntas) y Big Shoulders Display para
// titulares, marcadores y el wordmark (condensada de cartel/programa de cancha). Solo los pesos usados.
const instrument = Instrument_Sans({
  variable: "--font-instrument",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

// Big Shoulders (ex "Display"): variable con eje óptico → a tamaños grandes usa el corte Display.
const bigShoulders = Big_Shoulders({
  variable: "--font-big-shoulders",
  subsets: ["latin"],
  weight: "variable",
  axes: ["opsz"],
  display: "swap",
});

const SITE_URL = canonicalSiteUrl();
const DESCRIPTION =
  "Trivia de fútbol en tiempo real. Cada pregunta es un penal: respondé bien y más rápido que tu rival para meter el gol o atajar. Mundial (48 selecciones) o fútbol argentino (30 clubes).";

// Metadatos completos para el lanzamiento: preview social (Open Graph / Twitter, clave para los
// links que se comparten por WhatsApp) + base absoluta + tema papel. La imagen de preview la
// genera `app/opengraph-image.tsx` (Next la enchufa sola en og:image / twitter:image).
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  applicationName: "Tanda",
  title: {
    default: "Tanda — Trivia de penales en tiempo real",
    template: "%s · Tanda",
  },
  description: DESCRIPTION,
  keywords: ["trivia", "mundial", "fútbol argentino", "fútbol", "penales", "multijugador", "tiempo real", "2026"],
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    locale: "es_AR",
    url: "/",
    siteName: "Tanda",
    title: "Tanda — Trivia de penales en tiempo real",
    description: DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
    title: "Tanda — Trivia de penales en tiempo real",
    description: DESCRIPTION,
  },
  appleWebApp: { capable: true, statusBarStyle: "default", title: "Tanda" },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: "#ede9df",
  colorScheme: "light",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className={`${instrument.variable} ${bigShoulders.variable}`}>
      {/* Feedback 3 #10: la página scrollea el DOCUMENTO y el footer es parte del flujo, en TODAS las pantallas.
          El contenido estira (`flex-1`) → si entra, no hay scroll y el footer queda al pie; si no, se scrollea. */}
      <body className="flex min-h-svh flex-col bg-bg text-fg">
        <PitchBackground />
        <div className="flex w-full flex-1 flex-col">{children}</div>
        <Footer />
      </body>
    </html>
  );
}
