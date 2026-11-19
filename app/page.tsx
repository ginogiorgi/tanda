import Link from "next/link";
import { HelpSheet } from "@/components/ui/HelpSheet";
import { HOWTO } from "@/lib/help/howto";
import { getSession } from "@/lib/supabase/session";
import { GuestButton } from "@/components/lobby/GuestButton";
import { ROOM_ERROR_MESSAGES } from "@/lib/errors";
import { JsonLd } from "@/components/common/JsonLd";
import { buttonVariants } from "@/components/ui/Button";
import { Wordmark } from "@/components/brand/Wordmark";
import { FeedbackButton } from "@/components/feedback/FeedbackButton";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ aviso?: string }>;
}) {
  const { aviso } = await searchParams;
  const avisoMsg = aviso ? ROOM_ERROR_MESSAGES[aviso] : null;

  const { supabase, user } = await getSession();

  const isGuest = user?.isAnonymous === true;

  // Perfil + torneo en curso son independientes → en paralelo. El torneo en curso permite ofrecer
  // "Volver al partido" tras cerrar la pestaña. Modos y liga se cargan en `/jugar`, no acá.
  let username: string | null = null;
  let hasActiveMatch = false;
  if (user) {
    const [profileRes, activeRes] = await Promise.all([
      supabase.from("profiles").select("username").eq("id", user.id).single(),
      supabase.rpc("get_active_tournament"),
    ]);
    // Un error acá no debe pasar inadvertido (logs de Vercel) ni tumbar la home: se degrada.
    for (const [name, res] of [["profiles", profileRes], ["get_active_tournament", activeRes]] as const) {
      if (res.error) console.error(`[home] ${name}`, res.error.code, res.error.message);
    }
    // Si `profiles` falla (p. ej. el 401 transitorio de un token recién emitido), el usuario sigue
    // logueado: el nombre sale de la metadata del alta (wip/fix-guest).
    const metaName: unknown = user.metadata.username;
    username = profileRes.data?.username ?? (typeof metaName === "string" ? metaName : null);
    hasActiveMatch = Boolean(activeRes.data?.tournament_id);
  }

  return (
    <main className="flex w-full flex-1 flex-col items-center text-center">
      <JsonLd />
      <FeedbackButton />
      <div className="my-auto flex w-full flex-col items-center gap-8 px-6 py-16 [@media(max-height:820px)]:gap-5 [@media(max-height:820px)]:py-6">
      <div className="flex flex-col items-center gap-5">
        <h1 aria-label="Tanda">
          <Wordmark stamp={false} className="text-[6.5rem] sm:text-[10rem] sm:[@media(max-height:820px)]:text-[8rem]" />
        </h1>
        {/* Filete + bajada: presentación del juego, solo en la landing (logueado ya lo conocés). */}
        {!user && (
          <>
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
          </>
        )}
      </div>

      {avisoMsg && (
        <p className="rounded-[4px] border-2 border-ink bg-bg-elevated px-3 py-2 text-sm font-semibold text-brand-ink">
          {avisoMsg}
        </p>
      )}

      {user ? (
        // Feedback 14/11: una sola acción principal. JUGAR lleva a `/jugar` (los modos, ranked y salas
        // viven ahí); perfil, tabla y salir cuelgan del perfil. Con un partido en curso, la
        // principal pasa a ser volver a él.
        <div className="flex w-full max-w-sm flex-col items-stretch gap-4">
          <p className="text-lg">
            {isGuest ? (
              <>
                Estás jugando como <span className="font-semibold text-brand-ink">invitado</span>
              </>
            ) : (
              <>
                Hola, <span className="font-semibold text-brand-ink">{username}</span>
              </>
            )}
          </p>
          {hasActiveMatch ? (
            <>
              <Link href="/partido" className={buttonVariants({ variant: "primary", size: "lg", className: "h-14 text-2xl" })}>
                Volver al partido
              </Link>
              <Link href="/jugar" className={buttonVariants({ variant: "outline", size: "lg" })}>
                Jugar
              </Link>
            </>
          ) : (
            <Link href="/jugar" className={buttonVariants({ variant: "primary", size: "lg", className: "h-14 text-2xl" })}>
              Jugar
            </Link>
          )}
          <HelpSheet trigger="button" label="Cómo jugar" title="Cómo jugar" sections={HOWTO} />
          <Link href="/perfil" className={buttonVariants({ variant: "outline", size: "lg" })}>
            {isGuest ? "Perfil" : "Mi perfil"}
          </Link>
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
