"use client";

import { useEffect, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getGuestName } from "@/lib/guest/storage";

const noopSubscribe = () => () => {};

/**
 * Modo práctica invitado (§8.4): 1 humano + 47 bots corriendo `lib/engine` del lado cliente, sin
 * Realtime ni escrituras RLS. 8.1 entra acá con el nombre ya guardado; 8.1b monta el torneo local.
 */
export function GuestPractice() {
  const router = useRouter();
  // Lee el nombre de localStorage sin setState-en-effect ni mismatch de hidratación (server → null).
  const name = useSyncExternalStore(noopSubscribe, getGuestName, () => null);

  useEffect(() => {
    if (name === null) router.replace("/invitado");
  }, [name, router]);

  if (!name) return null; // redirigiendo o sin nombre todavía

  return (
    <main className="flex min-h-dvh w-full flex-col items-center justify-center gap-6 px-6 py-16 text-center">
      <span className="text-sm font-medium uppercase tracking-[0.3em] text-fg-subtle">
        Modo práctica
      </span>
      <p className="text-lg">
        Listo, <span className="font-semibold text-gold">{name}</span>. Tu torneo
        de práctica arranca acá.
      </p>
      <p className="max-w-md text-balance text-sm text-fg-muted">
        Próximo paso (8.1b): el torneo de 48 corre sobre el motor, sin red.
      </p>
      <Link
        href="/"
        className="text-sm text-fg-subtle underline-offset-4 transition-colors hover:text-fg hover:underline"
      >
        Volver al inicio
      </Link>
    </main>
  );
}
