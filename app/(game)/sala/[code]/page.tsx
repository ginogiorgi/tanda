import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/supabase/session";
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

  const { supabase, user } = await getSession();
  if (!user) redirect("/login");

  // Idempotente: re-entra a un miembro (refresh) o une a quien llega por link compartido.
  const { error: joinError } = await supabase.rpc("join_room", { p_code: code });
  if (joinError) redirect(`/jugar?aviso=${reasonFromError(joinError.message)}`);

  // Tras el join, la sala y el perfil son independientes → en paralelo.
  const [{ data: room }, { data: profile }] = await Promise.all([
    supabase.from("rooms").select("status, starts_at, mode_id").eq("code", code).single(),
    supabase.from("profiles").select("username").eq("id", user.id).single(),
  ]);
  if (!room) redirect("/jugar?aviso=room_not_found");
  if (room.status === "cancelled") redirect("/jugar?aviso=room_cancelled");

  return (
    <div className="flex w-full flex-1 flex-col">
      <Lobby
        code={code}
        modeId={room.mode_id}
        startsAt={room.starts_at}
        serverNow={new Date().toISOString()}
        userId={user.id}
        username={profile?.username ?? "Jugador"}
      />
    </div>
  );
}
