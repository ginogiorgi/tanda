"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { signInAsGuest } from "@/lib/guest/anon";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";

/** §8.4: entra como invitado (sesión anónima, username autoasignado) y cae en el home a jugar. */
export function GuestButton({ className }: { className?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
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
    router.push("/");
    router.refresh();
  }

  return (
    <div className={cn("flex flex-col items-stretch gap-2", className)}>
      <Button
        onClick={onClick}
        disabled={busy}
        variant="outline"
        size="lg"
        className="w-full"
      >
        {busy ? "Entrando…" : "Jugar como invitado"}
      </Button>
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}
