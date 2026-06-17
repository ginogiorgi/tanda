"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { signInAsGuest } from "@/lib/guest/anon";

/** §8.4: entra como invitado (sesión anónima, username autoasignado) y cae en el home a jugar. */
export function GuestButton() {
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
    <div className="flex flex-col items-center gap-2">
      <button
        onClick={onClick}
        disabled={busy}
        className="rounded-lg bg-gold px-6 py-4 text-lg font-bold text-bg transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {busy ? "Entrando…" : "Jugar como invitado"}
      </button>
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}
