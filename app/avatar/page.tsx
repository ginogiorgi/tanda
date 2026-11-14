import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AvatarCreator } from "@/components/avatar/AvatarCreator";
import { saveAvatar } from "./actions";
import { DEFAULT_AVATAR, isValidAvatar } from "@/lib/avatar/parts";
import type { AvatarConfig } from "@/lib/avatar/types";

// Privada (requiere sesión) → noindex (D2).
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function AvatarPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  // Tarea 1: al guardar, volver según de dónde se abrió — tras crear cuenta (`from=signup`) al inicio;
  // editando desde el perfil, al perfil.
  const { from } = await searchParams;
  const redirectTo = from === "signup" ? "/" : "/perfil";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");
  // El invitado (sesión anónima) no edita su avatar: queda con el masculino default (§8.4).
  if (user.is_anonymous) redirect("/perfil");

  const { data: profile } = await supabase
    .from("profiles")
    .select("avatar")
    .eq("id", user.id)
    .single();

  const initial: AvatarConfig = isValidAvatar(profile?.avatar)
    ? profile.avatar
    : DEFAULT_AVATAR;

  return (
    <main className="flex min-h-0 w-full flex-1 flex-col items-center gap-6 overflow-y-auto px-2 py-10">
      <div className="flex flex-col items-center gap-2 text-center">
        <h1 className="font-display text-5xl font-black uppercase leading-[0.9] text-fg">
          Armá tu jugador
        </h1>
        <p className="max-w-md text-balance text-sm text-fg-muted">
          Es el mismo que patea y ataja los penales. Después lo podés editar desde tu
          perfil.
        </p>
      </div>
      <AvatarCreator initial={initial} onSave={saveAvatar} redirectTo={redirectTo} />
    </main>
  );
}
