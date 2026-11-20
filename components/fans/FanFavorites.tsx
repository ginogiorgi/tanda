"use client";

import Link from "next/link";
import { useState } from "react";
import { useNav } from "@/lib/nav/useNav";
import { browserClient } from "@/lib/supabase/lazy";
import { FavoritePicker } from "@/components/fans/FavoritePicker";
import { buttonVariants } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

/**
 * Tus favoritos en `/hinchas` (feedback 3 #15): los dos selectores a la par; cada cambio se guarda al toque
 * (`set_favorites`, sin límite) y refresca el ranking. Invitado o sin sesión: ve el ranking y se le ofrece
 * crear la cuenta para elegir.
 */
export function FanFavorites({
  registered,
  isGuest,
  club: initialClub,
  nation: initialNation,
}: {
  registered: boolean;
  isGuest: boolean;
  club: string | null;
  nation: string | null;
}) {
  const nav = useNav();
  const [club, setClub] = useState(initialClub);
  const [nation, setNation] = useState(initialNation);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  if (!registered) {
    return (
      <Card className="flex flex-col items-center gap-3 text-center sm:flex-row sm:text-left">
        <p className="flex-1 text-sm text-fg-muted">
          Para sumar a tu club y a tu país al ranking necesitás una cuenta. Es un minuto: usuario y contraseña.
        </p>
        <Link href="/register" className={buttonVariants({ variant: "primary", size: "md", className: "w-full sm:w-auto" })}>
          {isGuest ? "Pasar a cuenta" : "Crear cuenta"}
        </Link>
      </Card>
    );
  }

  async function save(nextClub: string | null, nextNation: string | null) {
    if (!nextClub || !nextNation) return; // hasta tener los dos (cuentas de antes del 19/11)
    setStatus("saving");
    const supabase = await browserClient();
    const { error } = await supabase.rpc("set_favorites", { p_club: nextClub, p_nation: nextNation });
    if (error) {
      setStatus("error");
      return;
    }
    setStatus("saved");
    nav.refresh();
  }

  return (
    <section aria-label="Tus favoritos" className="flex flex-col gap-2">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <FavoritePicker
          kind="club"
          value={club}
          onChange={(code) => {
            setClub(code);
            void save(code, nation);
          }}
        />
        <FavoritePicker
          kind="nation"
          value={nation}
          onChange={(code) => {
            setNation(code);
            void save(club, code);
          }}
        />
      </div>
      <p className="min-h-4 text-xs text-fg-subtle" role="status">
        {status === "saving"
          ? "Guardando…"
          : status === "saved"
            ? "Listo, ya sumás para tus favoritos."
            : status === "error"
              ? "No pudimos guardar. Probá de nuevo."
              : "Cambialos cuando quieras."}
      </p>
    </section>
  );
}
