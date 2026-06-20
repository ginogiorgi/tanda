"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { usernameToEmail } from "@/lib/auth";
import { Button } from "@/components/ui/Button";
import { Input, Field } from "@/components/ui/Input";

export function LoginForm() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: usernameToEmail(username),
      password,
    });
    setLoading(false);

    if (signInError) {
      setError("Usuario o contraseña incorrectos.");
      return;
    }

    router.push("/");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="flex w-full flex-col gap-4 text-left">
      <Field label="Usuario" htmlFor="login-username">
        <Input
          id="login-username"
          type="text"
          autoComplete="username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="tu_usuario"
          autoFocus
        />
      </Field>

      <Field label="Contraseña" htmlFor="login-password">
        <Input
          id="login-password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
        />
      </Field>

      {error && <p className="text-sm text-danger">{error}</p>}

      <Button type="submit" disabled={loading} block size="lg" className="mt-2">
        {loading ? "Entrando…" : "Entrar"}
      </Button>

      <p className="text-center text-sm">
        <Link href="/forgot" className="font-medium text-fg-muted hover:text-fg hover:underline">
          ¿Olvidaste tu contraseña?
        </Link>
      </p>

      <p className="text-center text-sm text-fg-muted">
        ¿No tenés cuenta?{" "}
        <Link href="/register" className="font-medium text-gold hover:underline">
          Registrate
        </Link>
      </p>
    </form>
  );
}
