"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  getGuestName,
  isValidGuestName,
  setGuestName,
} from "@/lib/guest/storage";

/** §8.4: pide un nombre (2–20, no único, sin password), lo guarda en localStorage y entra a /practica. */
export function GuestNameForm() {
  const router = useRouter();
  const [name, setName] = useState(() => getGuestName() ?? "");
  const [error, setError] = useState<string | null>(null);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isValidGuestName(name)) {
      setError("Poné un nombre de entre 2 y 20 caracteres.");
      return;
    }
    setGuestName(name);
    router.push("/practica");
  }

  return (
    <form onSubmit={onSubmit} className="flex w-full max-w-sm flex-col gap-4">
      <label htmlFor="guest-name" className="sr-only">
        Tu nombre
      </label>
      <input
        id="guest-name"
        type="text"
        value={name}
        onChange={(e) => {
          setName(e.target.value);
          if (error) setError(null);
        }}
        maxLength={20}
        autoFocus
        placeholder="Tu nombre"
        className="w-full rounded-lg border border-border bg-bg-elevated px-4 py-3 text-center text-lg text-fg outline-none transition-colors focus:border-gold"
      />
      <button
        type="submit"
        className="w-full rounded-lg bg-gold px-6 py-4 text-lg font-bold text-bg transition-opacity hover:opacity-90"
      >
        Jugar
      </button>
      {error && <p className="text-center text-sm text-danger">{error}</p>}
    </form>
  );
}
