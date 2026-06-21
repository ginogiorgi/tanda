import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { LogoutButton } from "@/components/auth/LogoutButton";
import { PlayMenu } from "@/components/lobby/PlayMenu";
import { GuestButton } from "@/components/lobby/GuestButton";
import { ROOM_ERROR_MESSAGES } from "@/lib/errors";
import { JsonLd } from "@/components/common/JsonLd";
import { buttonVariants } from "@/components/ui/Button";
import { Eyebrow } from "@/components/ui/Typography";

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
    <main className="bg-pitch flex min-h-0 w-full flex-1 flex-col items-center overflow-y-auto px-6 py-16 text-center">
      <JsonLd />
      <div className="my-auto flex w-full flex-col items-center gap-8">
      <div className="flex flex-col items-center gap-4">
        <Eyebrow className="tracking-[0.3em]">Mundial · Trivia · Tiempo real</Eyebrow>
        <h1 className="font-display text-7xl font-bold uppercase tracking-tight text-gold drop-shadow-[0_8px_30px_rgba(212,175,55,0.18)] sm:text-9xl">
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
            <Link href="/partido" className={buttonVariants({ variant: "primary", size: "lg" })}>
              Volver al partido
            </Link>
          )}
          <PlayMenu />
          <div className="flex w-full max-w-sm flex-col items-stretch gap-3 sm:flex-row sm:justify-center">
            {isGuest ? (
              <Link
                href="/register"
                className={buttonVariants({ variant: "outline", size: "lg", className: "w-full sm:w-auto sm:min-w-[11rem]" })}
              >
                Creá una cuenta
              </Link>
            ) : (
              <Link
                href="/perfil"
                className={buttonVariants({ variant: "outline", size: "lg", className: "w-full sm:w-auto sm:min-w-[11rem]" })}
              >
                Mi perfil
              </Link>
            )}
            <LogoutButton size="lg" className="w-full sm:w-auto sm:min-w-[11rem]" />
          </div>
        </div>
      ) : (
        <div className="grid w-full max-w-md grid-cols-1 justify-items-center gap-3 sm:grid-cols-2">
          <Link
            href="/register"
            className={buttonVariants({
              variant: "primary",
              size: "lg",
              className: "order-1 w-full sm:col-span-2 sm:w-52 sm:justify-self-center",
            })}
          >
            Crear cuenta
          </Link>
          <Link
            href="/login"
            className={buttonVariants({
              variant: "outline",
              size: "lg",
              className: "order-2 w-full sm:w-52 sm:justify-self-end",
            })}
          >
            Entrar
          </Link>
          <GuestButton className="order-3 w-full sm:w-52 sm:justify-self-start" />
        </div>
      )}

      <p className="mt-4 max-w-xs text-balance text-[11px] leading-relaxed text-fg-subtle">
        Juego original e independiente. No está afiliado, asociado ni autorizado por la FIFA ni por
        ninguna organización futbolística. Naciones y selecciones a modo ilustrativo.
      </p>
      </div>
    </main>
  );
}
