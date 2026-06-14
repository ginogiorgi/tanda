import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AvatarCreator } from "@/components/avatar/AvatarCreator";
import { DEFAULT_AVATAR, isValidAvatar } from "@/lib/avatar/parts";
import type { AvatarConfig } from "@/lib/avatar/types";

export default async function AvatarPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("avatar")
    .eq("id", user.id)
    .single();

  const initial: AvatarConfig = isValidAvatar(profile?.avatar)
    ? profile.avatar
    : DEFAULT_AVATAR;

  return (
    <main className="flex min-h-dvh w-full flex-col items-center gap-6 px-2 py-10">
      <div className="flex flex-col items-center gap-2 text-center">
        <h1 className="text-3xl font-extrabold tracking-tight text-gold">
          Armá tu jugador
        </h1>
        <p className="max-w-md text-balance text-sm text-fg-muted">
          Es el mismo que patea y ataja los penales. Después lo podés editar desde tu
          perfil.
        </p>
      </div>
      <AvatarCreator initial={initial} />
    </main>
  );
}
