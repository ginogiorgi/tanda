"use client";

import { useRef, useState } from "react";
import { useNav } from "@/lib/nav/useNav";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { isValidUsername, usernameToEmail } from "@/lib/auth";
import { Button } from "@/components/ui/Button";
import { Input, Field } from "@/components/ui/Input";

/** Estado del chequeo de disponibilidad del username (RPC `username_available`). */
type Availability = "idle" | "checking" | "free" | "taken";

export function RegisterForm({ upgrade = false }: { upgrade?: boolean }) {
  const router = useNav();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [availability, setAvailability] = useState<Availability>("idle");

  // Debounce + protección de carrera para el chequeo de disponibilidad, manejado desde el
  // onChange (no en un effect). La RLS no deja leer perfiles ajenos, así que usamos el RPC
  // `username_available` (SECURITY DEFINER, devuelve solo un booleano).
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reqIdRef = useRef(0);

  function onUsernameChange(value: string) {
    setUsername(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const name = value.trim();
    const reqId = ++reqIdRef.current;

    if (!isValidUsername(name)) {
      setAvailability("idle");
      return;
    }
    setAvailability("checking");
    debounceRef.current = setTimeout(async () => {
      const supabase = createClient();
      const { data, error: rpcError } = await supabase.rpc("username_available", {
        check_name: name,
      });
      if (reqId !== reqIdRef.current) return; // respuesta vieja, la ignoramos.
      if (rpcError) {
        setAvailability("idle"); // ante duda, dejamos seguir; el alta valida igual.
        return;
      }
      setAvailability(data ? "free" : "taken");
    }, 400);
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    if (!isValidUsername(username)) {
      setError("El usuario va de 3 a 20 caracteres: letras, números o guion bajo.");
      return;
    }
    if (availability === "taken") {
      setError("Ese usuario ya está tomado. Probá con otro.");
      return;
    }
    if (password.length < 6) {
      setError("La contraseña necesita al menos 6 caracteres.");
      return;
    }

    setLoading(true);
    const supabase = createClient();
    const trimmed = username.trim();

    // Upgrade del invitado (sesión anónima → permanente): mantiene id/profile/avatar, le suma
    // email sintético + password + username elegido. El profile ya existe (invitado_…) → lo updateamos.
    if (upgrade) {
      const { error: upgradeError } = await supabase.auth.updateUser({
        email: usernameToEmail(trimmed),
        password,
        data: { username: trimmed },
      });
      if (upgradeError) {
        setLoading(false);
        setError(
          /registered|exists|taken|already/i.test(upgradeError.message)
            ? "Ese usuario ya está tomado. Probá con otro."
            : "No se pudo crear la cuenta. Probá de nuevo en un momento.",
        );
        return;
      }
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        const { error: profileError } = await supabase
          .from("profiles")
          .update({ username: trimmed })
          .eq("id", user.id);
        if (profileError) {
          setLoading(false);
          setError("Ese usuario ya está tomado. Probá con otro.");
          return;
        }
      }
      setLoading(false);
      router.push("/avatar?from=signup");
      router.refresh();
      return;
    }

    const { data, error: signUpError } = await supabase.auth.signUp({
      email: usernameToEmail(trimmed),
      password,
      options: { data: { username: trimmed } },
    });
    setLoading(false);

    if (signUpError) {
      setError("No se pudo crear la cuenta. Probá de nuevo en un momento.");
      return;
    }
    // Supabase ofusca duplicados devolviendo identities vacío (backstop del chequeo).
    if (data.user && data.user.identities && data.user.identities.length === 0) {
      setError("Ese usuario ya está tomado. Probá con otro.");
      return;
    }

    router.push("/avatar?from=signup");
    router.refresh();
  }

  const showAvailability = isValidUsername(username.trim());

  return (
    <form onSubmit={onSubmit} className="flex w-full flex-col gap-4 text-left">
      <Field label="Usuario" htmlFor="reg-username">
        <Input
          id="reg-username"
          type="text"
          autoComplete="username"
          value={username}
          onChange={(e) => onUsernameChange(e.target.value)}
          invalid={showAvailability && availability === "taken"}
          placeholder="tu_usuario"
          autoFocus
        />
        {showAvailability && availability === "checking" && (
          <span className="text-xs text-fg-subtle">Chequeando…</span>
        )}
        {showAvailability && availability === "free" && (
          <span className="text-xs text-success">Disponible ✓</span>
        )}
        {showAvailability && availability === "taken" && (
          <span className="text-xs font-semibold text-brand-ink">Ese usuario ya está tomado.</span>
        )}
      </Field>

      <Field label="Contraseña" htmlFor="reg-password">
        <Input
          id="reg-password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
        />
      </Field>

      {error && <p className="text-sm font-semibold text-brand-ink">{error}</p>}

      <Button type="submit" disabled={loading || availability === "taken"} block size="lg" className="mt-2">
        {loading ? "Creando…" : "Crear cuenta"}
      </Button>

      <p className="text-center text-sm text-fg-muted">
        ¿Ya tenés cuenta?{" "}
        <Link href="/login" className="font-medium text-brand hover:underline">
          Entrá
        </Link>
      </p>
    </form>
  );
}
