import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Lobby } from "@/components/lobby/Lobby";
import { isKnownRoomError } from "@/lib/errors";

// Sala privada (por código/usuario) → noindex (D2).
export const metadata: Metadata = { robots: { index: false, follow: false } };

/** `join_room` devuelve un código en inglés → motivo para el aviso del home (genérico si no se conoce). */
function reasonFromError(message: string): string {
  return isKnownRoomError(message) ? message : "room_not_found";
}

export default async function SalaPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code: rawCode } = await params;
  const code = rawCode.toUpperCase();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Idempotente: re-entra a un miembro (refresh) o une a quien llega por link compartido.
  const { error: joinError } = await supabase.rpc("join_room", { p_code: code });
  if (joinError) redirect(`/?aviso=${reasonFromError(joinError.message)}`);

  // Tras el join, la sala y el perfil son independientes → en paralelo.
  const [{ data: room }, { data: profile }] = await Promise.all([
    supabase.from("rooms").select("status, starts_at, mode_id").eq("code", code).single(),
    supabase.from("profiles").select("username").eq("id", user.id).single(),
  ]);
  if (!room) redirect("/?aviso=room_not_found");
  if (room.status === "cancelled") redirect("/?aviso=room_cancelled");

  return (
    <main className="bg-pitch flex min-h-0 w-full flex-1 flex-col items-center justify-center gap-8 overflow-y-auto px-6 py-12">
      <Lobby
        code={code}
        modeId={room.mode_id}
        startsAt={room.starts_at}
        serverNow={new Date().toISOString()}
        userId={user.id}
        username={profile?.username ?? "Jugador"}
      />
    </main>
  );
}
