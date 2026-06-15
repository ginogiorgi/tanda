"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

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
        <input
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            setSaved(false);
          }}
          className="flex-1 rounded-lg border border-border bg-bg px-4 py-2.5 text-fg outline-none transition-colors focus:border-gold"
          placeholder="tu@email.com"
        />
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-gold px-5 py-2.5 text-sm font-semibold text-bg transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {saving ? "Guardando…" : saved ? "Guardado ✓" : "Guardar"}
        </button>
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
    </form>
  );
}
