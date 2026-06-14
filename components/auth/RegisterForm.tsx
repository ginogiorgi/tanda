"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { isValidUsername, usernameToEmail } from "@/lib/auth";

export function RegisterForm() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    if (!isValidUsername(username)) {
      setError("El usuario va de 3 a 20 caracteres: letras, números o guion bajo.");
      return;
    }
    if (password.length < 6) {
      setError("La contraseña necesita al menos 6 caracteres.");
      return;
    }

    setLoading(true);
    const supabase = createClient();
    const { data, error: signUpError } = await supabase.auth.signUp({
      email: usernameToEmail(username),
      password,
      options: { data: { username: username.trim() } },
    });
    setLoading(false);

    if (signUpError) {
      setError("No se pudo crear la cuenta. Probá de nuevo en un momento.");
      return;
    }
    // Supabase ofusca duplicados devolviendo identities vacío.
    if (data.user && data.user.identities && data.user.identities.length === 0) {
      setError("Ese usuario ya está tomado. Probá con otro.");
      return;
    }

    router.push("/");
    router.refresh();
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

      <label className="flex flex-col gap-1.5 text-left">
        <span className="text-sm font-medium text-fg-muted">Contraseña</span>
        <input
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="rounded-lg border border-border bg-bg-elevated px-4 py-3 text-fg outline-none transition-colors focus:border-gold"
          placeholder="••••••••"
        />
      </label>

      {error && <p className="text-sm text-danger">{error}</p>}

      <button
        type="submit"
        disabled={loading}
        className="mt-2 rounded-lg bg-gold px-4 py-3 font-semibold text-bg transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {loading ? "Creando…" : "Crear cuenta"}
      </button>

      <p className="text-center text-sm text-fg-muted">
        ¿Ya tenés cuenta?{" "}
        <Link href="/login" className="font-medium text-gold hover:underline">
          Entrá
        </Link>
      </p>
    </form>
  );
}
