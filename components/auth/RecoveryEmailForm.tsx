"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface RecoveryEmailFormProps {
  /** Email de recuperación actual (de `user_metadata`), o null si no cargó ninguno. */
  initialEmail: string | null;
}

/**
 * Carga/edita el email de recuperación. Se guarda en `user_metadata.recovery_email` (no
 * cambia el email sintético del login). Sin email no hay recuperación. Ver SPEC §8.1 / 2.6.
 */
export function RecoveryEmailForm({ initialEmail }: RecoveryEmailFormProps) {
  const [email, setEmail] = useState(initialEmail ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSaved(false);

    const value = email.trim();
    if (!EMAIL_REGEX.test(value)) {
      setError("Poné un email válido.");
      return;
    }

    setSaving(true);
    const supabase = createClient();
    const { error: updateError } = await supabase.auth.updateUser({
      data: { recovery_email: value },
    });
    setSaving(false);

    if (updateError) {
      setError("No se pudo guardar. Probá de nuevo.");
      return;
    }
    setSaved(true);
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      {!initialEmail && (
        <p className="text-sm text-fg-muted">
          Agregá un email para no perder la cuenta: sin email no hay forma de recuperar la
          contraseña.
        </p>
      )}
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            setSaved(false);
          }}
          invalid={Boolean(error)}
          className="flex-1"
          placeholder="tu@email.com"
        />
        <Button type="submit" disabled={saving} variant="outline" size="sm" className="shrink-0">
          {saving ? "Guardando…" : saved ? "Guardado ✓" : "Guardar"}
        </Button>
      </div>
      {error && <p className="text-sm font-semibold text-brand-ink">{error}</p>}
    </form>
  );
}
