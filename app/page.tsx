import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { LogoutButton } from "@/components/auth/LogoutButton";
import { PlayMenu } from "@/components/lobby/PlayMenu";
import { GuestButton } from "@/components/lobby/GuestButton";
import { ROOM_ERROR_MESSAGES } from "@/lib/errors";
import { JsonLd } from "@/components/common/JsonLd";
import { buttonVariants } from "@/components/ui/Button";
import { Eyebrow } from "@/components/ui/Typography";
import { Wordmark } from "@/components/brand/Wordmark";
import { isModeId, type ModeId } from "@/lib/modes";
import type { RankedMe } from "@/lib/ranked/types";

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
  let activeModes: ModeId[] = [];
  let ranked: RankedMe | null = null;
  if (user) {
    const [{ data: profile }, { data: active }, { data: modes }, { data: rankedMe }] = await Promise.all([
      supabase.from("profiles").select("username").eq("id", user.id).single(),
      supabase.rpc("get_active_tournament"),
      supabase.from("game_modes").select("id").eq("active", true).order("sort"),
      supabase.rpc("get_ranked_me"),
    ]);
    ranked = rankedMe ?? null;
    // Si `profiles` falla (p. ej. el 401 transitorio de un token recién emitido), el usuario sigue
    // logueado: el nombre sale de la metadata del alta (wip/fix-guest).
    const metaName: unknown = user.user_metadata?.username;
    username = profile?.username ?? (typeof metaName === "string" ? metaName : null);
    hasActiveMatch = Boolean(active?.tournament_id);
    activeModes = (modes ?? []).map((m) => m.id).filter(isModeId);
  }

  return (
    <main className="flex min-h-0 w-full flex-1 flex-col items-center overflow-y-auto px-6 py-16 text-center">
      <JsonLd />
      <div className="my-auto flex w-full flex-col items-center gap-8">
      <div className="flex flex-col items-center gap-5">
        <Eyebrow>Mundial · Fútbol argentino · En vivo</Eyebrow>
        <h1 aria-label="Tanda">
          <Wordmark className="text-[6.5rem] sm:text-[10rem]" />
        </h1>
        {/* Filete de programa impreso: doble línea de tinta con la "edición" al medio. */}
        <div className="flex w-full max-w-md items-center gap-3" aria-hidden>
          <span className="h-[3px] flex-1 bg-ink" />
          <span className="font-display text-sm font-extrabold uppercase tracking-[0.2em] text-fg">
            Trivia de penales
          </span>
          <span className="h-[3px] flex-1 bg-ink" />
        </div>
        <p className="max-w-md text-balance text-base text-fg-muted sm:text-lg">
          Cada pregunta es un penal. Respondé bien y más rápido que tu rival para meter el gol o
          atajar. Mundial o fútbol argentino: una sola copa.
        </p>
      </div>

      {avisoMsg && (
        <p className="rounded-[4px] border-2 border-ink bg-bg-elevated px-3 py-2 text-sm font-semibold text-brand-ink">
          {avisoMsg}
        </p>
      )}

      {user ? (
        <div className="flex flex-col items-center gap-6">
          <p className="text-lg">
            {isGuest ? (
              <>
                Estás jugando como{" "}
                <span className="font-semibold text-brand-ink">invitado</span>
              </>
            ) : (
              <>
                Hola, <span className="font-semibold text-brand-ink">{username}</span> 👋
              </>
            )}
          </p>
          {hasActiveMatch && (
            <Link href="/partido" className={buttonVariants({ variant: "primary", size: "lg" })}>
              Volver al partido
            </Link>
          )}
          <PlayMenu activeModes={activeModes} ranked={ranked} />
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
            <Link
              href="/ranking"
              className={buttonVariants({ variant: "outline", size: "lg", className: "w-full sm:w-auto sm:min-w-[9rem]" })}
            >
              Tabla
            </Link>
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

      <p className="mt-4 max-w-xs text-balance text-xs leading-relaxed text-fg-subtle">
        Juego original e independiente. No está afiliado, asociado ni autorizado por la FIFA ni por
        ninguna organización futbolística. Selecciones y clubes a modo ilustrativo; los escudos son
        diseños originales.
      </p>
      </div>
    </main>
  );
}
