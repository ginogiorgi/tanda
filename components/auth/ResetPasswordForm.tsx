"use client";

import { useState } from "react";
import { useNav } from "@/lib/nav/useNav";
import { browserClient } from "@/lib/supabase/lazy";
import { Button } from "@/components/ui/Button";
import { Input, Field } from "@/components/ui/Input";

export function ResetPasswordForm() {
  const router = useNav();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    if (password.length < 6) {
      setError("La contraseña necesita al menos 6 caracteres.");
      return;
    }
    if (password !== confirm) {
      setError("Las contraseñas no coinciden.");
      return;
    }

    setLoading(true);
    const supabase = await browserClient();
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setLoading(false);

    if (updateError) {
      setError("No se pudo actualizar. Pedí un link nuevo e intentá de nuevo.");
      return;
    }
    setDone(true);
    router.refresh();
  }

  if (done) {
    return (
      <div className="flex flex-col gap-4 text-center">
        <p className="text-sm text-fg-muted">
          Listo, tu contraseña quedó actualizada.
        </p>
        <Button type="button" onClick={() => router.push("/")} size="lg">
          Ir al inicio
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex w-full flex-col gap-4 text-left">
      <Field label="Nueva contraseña" htmlFor="reset-password">
        <Input
          id="reset-password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
          autoFocus
        />
      </Field>

      <Field label="Repetir contraseña" htmlFor="reset-confirm">
        <Input
          id="reset-confirm"
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          placeholder="••••••••"
        />
      </Field>

      {error && <p className="text-sm font-semibold text-brand-ink">{error}</p>}

      <Button type="submit" disabled={loading} block size="lg" className="mt-2">
        {loading ? "Guardando…" : "Guardar contraseña"}
      </Button>
    </form>
  );
}
