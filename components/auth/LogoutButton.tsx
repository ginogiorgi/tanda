"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function LogoutButton() {
  const router = useRouter();

  async function onClick() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  }

  return (
    <button
      onClick={onClick}
      className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-fg-muted transition-colors hover:border-fg-subtle hover:text-fg"
    >
      Cerrar sesión
    </button>
  );
}
