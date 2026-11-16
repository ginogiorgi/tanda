import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { QaClient } from "./QaClient";

export const metadata: Metadata = { robots: { index: false, follow: false } };

/**
 * Galería de QA del avatar (feedback 2, P7a.1). 404 en producción. Una pieza por query, cámara y
 * pose fijas, canvas 768×768 sin animación → capturas deterministas (`pnpm qa:avatar`):
 *
 *   ?body=male|female&hair=parted&sk=%23A06B45&view=front|q34|side|back|top|feet|low&pose=ready|kick|dive|celebrate
 *   ?sheet=swatches   lámina de paletas (+ ropa vs piel, ΔE)
 */
export default async function AvatarQaPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (process.env.NODE_ENV === "production") notFound();
  const sp = await searchParams;
  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
  return (
    <QaClient
      sheet={one("sheet") ?? null}
      body={one("body") === "female" ? "female" : "male"}
      hair={one("hair") ?? "parted"}
      hairColor={one("hc") ?? "#3A2A20"}
      skin={one("sk") ?? "#A06B45"}
      view={one("view") ?? "front"}
      pose={one("pose") ?? "ready"}
    />
  );
}
