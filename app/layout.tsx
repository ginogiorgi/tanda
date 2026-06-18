import type { Metadata, Viewport } from "next";
import { Outfit } from "next/font/google";
import "./globals.css";

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
  display: "swap",
});

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://tanda2026.com.ar";
const DESCRIPTION =
  "Trivia de Mundiales en tiempo real. Cada pregunta es un penal: respondé bien y más rápido que tu rival para meter el gol o atajar. 48 selecciones, una sola copa.";

// Metadatos completos para el lanzamiento: preview social (Open Graph / Twitter, clave para los
// links que se comparten por WhatsApp) + base absoluta + tema oscuro. La imagen de preview la
// genera `app/opengraph-image.tsx` (Next la enchufa sola en og:image / twitter:image).
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  applicationName: "Tanda",
  title: {
    default: "Tanda — Trivia Mundialista en tiempo real",
    template: "%s · Tanda",
  },
  description: DESCRIPTION,
  keywords: ["trivia", "mundial", "fútbol", "penales", "multijugador", "tiempo real", "2026"],
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    locale: "es_AR",
    url: "/",
    siteName: "Tanda",
    title: "Tanda — Trivia Mundialista en tiempo real",
    description: DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
    title: "Tanda — Trivia Mundialista en tiempo real",
    description: DESCRIPTION,
  },
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "Tanda" },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: "#0a0a0a",
  colorScheme: "dark",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className={`${outfit.variable} h-full`}>
      <body className="min-h-full flex flex-col bg-bg text-fg">{children}</body>
    </html>
  );
}
