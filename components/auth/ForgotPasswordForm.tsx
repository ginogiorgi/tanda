"use client";

import { useState } from "react";
import Link from "next/link";
import { isValidUsername } from "@/lib/auth";
import { requestPasswordReset } from "@/app/(auth)/forgot/actions";

export function ForgotPasswordForm() {
  const [username, setUsername] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setMessage(null);

    if (!isValidUsername(username)) {
      setError("Poné un usuario válido (3 a 20 caracteres).");
      return;
    }

    setLoading(true);
    const result = await requestPasswordReset(username.trim());
    setLoading(false);

    // El server siempre devuelve un mensaje genérico (no revela si la cuenta existe).
    setMessage(result.error ?? "Listo. Revisá tu correo.");
  }

  if (message) {
    return (
      <div className="flex flex-col gap-4 text-center">
        <p className="text-sm text-fg-muted">{message}</p>
        <Link href="/login" className="text-sm font-medium text-gold hover:underline">
          Volver a entrar
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex w-full flex-col gap-4">
      <label className="flex flex-col gap-1.5 text-left">
        <span className="text-sm font-medium text-fg-muted">Usuario</span>
        <input
          type="text"
          autoComplete="username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          className="rounded-lg border border-border bg-bg-elevated px-4 py-3 text-fg outline-none transition-colors focus:border-gold"
          placeholder="tu_usuario"
          autoFocus
        />
      </label>

      {error && <p className="text-sm text-danger">{error}</p>}

      <button
        type="submit"
        disabled={loading}
        className="mt-2 rounded-lg bg-gold px-4 py-3 font-semibold text-bg transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {loading ? "Enviando…" : "Enviar link"}
      </button>

      <p className="text-center text-sm text-fg-muted">
        <Link href="/login" className="font-medium text-gold hover:underline">
          Volver
        </Link>
      </p>
    </form>
  );
}
