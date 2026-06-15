import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { LogoutButton } from "@/components/auth/LogoutButton";
import { PlayMenu } from "@/components/lobby/PlayMenu";

const ACCENTS = [
  "bg-accent-blue",
  "bg-accent-green",
  "bg-accent-red",
  "bg-accent-magenta",
  "bg-accent-orange",
  "bg-accent-teal",
] as const;

const AVISOS: Record<string, string> = {
  room_not_found: "No existe una sala con ese código.",
  room_cancelled: "Esa sala se canceló.",
  already_started: "Esa partida ya arrancó.",
  room_full: "Esa sala está llena.",
};

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ aviso?: string }>;
}) {
  const { aviso } = await searchParams;
  const avisoMsg = aviso ? AVISOS[aviso] : null;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let username: string | null = null;
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("username")
      .eq("id", user.id)
      .single();
    username = profile?.username ?? null;
  }

  return (
    <main className="flex min-h-dvh w-full flex-col items-center justify-center gap-8 px-6 py-16 text-center">
      <div className="flex flex-col items-center gap-4">
        <span className="text-sm font-medium uppercase tracking-[0.3em] text-fg-subtle">
          Mundial · Trivia · Tiempo real
        </span>
        <h1 className="text-6xl font-extrabold tracking-tight text-gold sm:text-8xl">
          TANDA
        </h1>
        <p className="max-w-md text-balance text-base text-fg-muted sm:text-lg">
          Cada pregunta es un penal. Respondé bien y más rápido que tu rival para
          meter el gol o atajar. 48 selecciones, una sola copa.
        </p>
      </div>

      <div className="flex items-center gap-2" aria-hidden>
        {ACCENTS.map((accent) => (
          <span key={accent} className={`h-2.5 w-2.5 rounded-full ${accent}`} />
        ))}
      </div>

      {avisoMsg && <p className="text-sm text-danger">{avisoMsg}</p>}

      {username ? (
        <div className="flex flex-col items-center gap-6">
          <p className="text-lg">
            Hola, <span className="font-semibold text-gold">{username}</span> 👋
          </p>
          <PlayMenu />
          <div className="flex flex-col items-center gap-3 sm:flex-row">
            <Link
              href="/perfil"
              className="rounded-lg border border-border px-6 py-3 font-medium text-fg transition-colors hover:border-fg-subtle"
            >
              Mi perfil
            </Link>
            <LogoutButton />
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3 sm:flex-row">
          <Link
            href="/register"
            className="rounded-lg bg-gold px-6 py-3 font-semibold text-bg transition-opacity hover:opacity-90"
          >
            Crear cuenta
          </Link>
          <Link
            href="/login"
            className="rounded-lg border border-border px-6 py-3 font-medium text-fg transition-colors hover:border-fg-subtle"
          >
            Entrar
          </Link>
        </div>
      )}
    </main>
  );
}
