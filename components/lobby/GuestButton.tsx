"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { signInAsGuest } from "@/lib/guest/anon";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";

/**
 * §8.4: entra como invitado (sesión anónima, username autoasignado) y cae en el home a jugar.
 * La navegación va en una transición: "Entrando…" dura lo que tarda el re-render del home y, si
 * por algo el server vuelve a mostrar el landing, el botón se rehabilita (antes quedaba colgado:
 * `busy` nunca volvía a false — bug de wip/fix-guest).
 */
export function GuestButton({ className }: { className?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [navigating, startNavigation] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function onClick() {
    setError(null);
    setBusy(true);
    const { error: guestError } = await signInAsGuest(createClient());
    if (guestError) {
      setBusy(false);
      setError(guestError);
      return;
    }
    setBusy(false);
    startNavigation(() => {
      router.push("/");
      router.refresh();
    });
  }

  const pending = busy || navigating;

  return (
    <div className={cn("flex flex-col items-stretch gap-2", className)}>
      <Button
        onClick={onClick}
        disabled={pending}
        variant="outline"
        size="lg"
        className="w-full"
      >
        {pending ? "Entrando…" : "Jugar como invitado"}
      </Button>
      {error && <p className="text-sm font-semibold text-brand-ink">{error}</p>}
    </div>
  );
}
