import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Suspense } from "react";
import { PenalDevHarness } from "./PenalDevHarness";

export const metadata: Metadata = { robots: { index: false, follow: false } };

/** Banco de pruebas de la escena 3D (Fase 6): dispara cada jugada a mano. 404 en producción. */
export default function PenalDevPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <Suspense>
      <PenalDevHarness />
    </Suspense>
  );
}
