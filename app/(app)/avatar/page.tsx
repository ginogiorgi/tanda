import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/supabase/session";
import { AvatarCreator } from "@/components/avatar/AvatarCreator";
import { saveAvatar } from "./actions";
import { parseAvatar } from "@/lib/avatar/schema";
import { Page } from "@/components/ui/Page";

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

  const { supabase, user } = await getSession();

  if (!user) redirect("/login");
  // El invitado (sesión anónima) no edita su avatar: queda con el masculino default (§8.4).
  if (user.isAnonymous) redirect("/perfil");

  const { data: profile } = await supabase
    .from("profiles")
    .select("avatar")
    .eq("id", user.id)
    .single();

  const initial = parseAvatar(profile?.avatar);

  return (
    <Page width="wide" className="items-center px-2">
      <div className="flex flex-col items-center gap-2 text-center">
        <h2 className="font-display text-4xl font-black uppercase leading-[0.9] text-fg">
          Armá tu jugador
        </h2>
        <p className="max-w-md text-balance text-sm text-fg-muted">
          Es el mismo que patea y ataja los penales. Después lo podés editar desde tu
          perfil.
        </p>
      </div>
      <AvatarCreator initial={initial} onSave={saveAvatar} redirectTo={redirectTo} />
    </Page>
  );
}
