import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { LogoutButton } from "@/components/auth/LogoutButton";
import { PlayMenu } from "@/components/lobby/PlayMenu";
import { GuestButton } from "@/components/lobby/GuestButton";
import { ROOM_ERROR_MESSAGES } from "@/lib/errors";

const ACCENTS = [
  "bg-accent-blue",
  "bg-accent-green",
  "bg-accent-red",
  "bg-accent-magenta",
  "bg-accent-orange",
  "bg-accent-teal",
] as const;

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ aviso?: string }>;
}) {
  const { aviso } = await searchParams;
  const avisoMsg = aviso ? ROOM_ERROR_MESSAGES[aviso] : null;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isGuest = user?.is_anonymous === true;

  // Perfil + torneo en curso son independientes → en paralelo (una sola ida, no dos secuenciales).
  // El torneo en curso permite ofrecer "Volver al partido" tras cerrar la pestaña.
  let username: string | null = null;
  let hasActiveMatch = false;
  if (user) {
    const [{ data: profile }, { data: active }] = await Promise.all([
      supabase.from("profiles").select("username").eq("id", user.id).single(),
      supabase.rpc("get_active_tournament"),
    ]);
    username = profile?.username ?? null;
    hasActiveMatch = Boolean((active as { tournament_id?: string } | null)?.tournament_id);
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
        {/* Tarea 11: crédito de autoría. */}
        <p className="text-xs text-fg-subtle">
          Hecho por{" "}
          <a
            href="https://www.pyrux.com.ar/es"
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-pyrux transition-opacity hover:opacity-80"
          >
            Pyrux
          </a>{" "}
          y{" "}
          <a
            href="https://www.instagram.com/delpianojuan/"
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-fg transition-opacity hover:opacity-80"
          >
            JM10
          </a>
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
            {isGuest ? (
              <>
                Estás jugando como{" "}
                <span className="font-semibold text-gold">invitado</span>
              </>
            ) : (
              <>
                Hola, <span className="font-semibold text-gold">{username}</span> 👋
              </>
            )}
          </p>
          {hasActiveMatch && (
            <Link
              href="/partido"
              className="rounded-lg bg-gold px-6 py-3 font-semibold text-bg transition-opacity hover:opacity-90"
            >
              Volver al partido
            </Link>
          )}
          <PlayMenu />
          <div className="flex flex-col items-center gap-3 sm:flex-row">
            {isGuest ? (
              <Link
                href="/register"
                className="rounded-lg border border-border px-6 py-3 font-medium text-fg transition-colors hover:border-fg-subtle"
              >
                Creá una cuenta
              </Link>
            ) : (
              <Link
                href="/perfil"
                className="rounded-lg border border-border px-6 py-3 font-medium text-fg transition-colors hover:border-fg-subtle"
              >
                Mi perfil
              </Link>
            )}
            <LogoutButton />
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-5">
          <GuestButton />
          <div className="flex flex-col items-center gap-3 sm:flex-row">
            <Link
              href="/register"
              className="rounded-lg border border-border px-6 py-3 font-medium text-fg transition-colors hover:border-fg-subtle"
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
        </div>
      )}

      <p className="mt-4 max-w-xs text-balance text-[11px] leading-relaxed text-fg-subtle">
        Juego original e independiente. No está afiliado, asociado ni autorizado por la FIFA ni por
        ninguna organización futbolística. Naciones y selecciones a modo ilustrativo.
      </p>
    </main>
  );
}
