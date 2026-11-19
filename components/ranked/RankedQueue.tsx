"use client";

/**
 * Cola ranked (Fase 4b). Al montar se encola (`ranked_enqueue`) y hace poll cada 2s (`ranked_poll`,
 * que también es el latido: sin poll el server te saca a los 15s). El emparejamiento (y su ventana de
 * rating, que se abre con la espera) lo decide el server y NO se muestra (feedback 14/11): acá solo
 * reloj y cuántos OTROS esperan (feedback 3 #13: Presence en `ranked:queue`, sin consultas a la DB).
 * Al emparejar → /partido (la presencia se va con el canal). Al salir, cancela.
 */

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import type { RankedMe, RankedPoll } from "@/lib/ranked/types";
import { othersWaiting, RANKED_QUEUE_CHANNEL, waitingLabel } from "@/lib/ranked/queue";
import { buttonVariants } from "@/components/ui/Button";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { useNav } from "@/lib/nav/useNav";
import { Card } from "@/components/ui/Card";
import { Eyebrow } from "@/components/ui/Typography";
import { DivisionProgress } from "./DivisionProgress";
import { usePreload3D } from "@/components/penal/usePreload3D";
import { Page } from "@/components/ui/Page";

const POLL_MS = 2000;

type View = "searching" | "matched" | "busy" | "error";

function clock(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function RankedQueue({ me, userId }: { me: RankedMe; userId: string }) {
  usePreload3D(); // el primer penal no paga la descarga del 3D (F4)
  const { push: navPush, leave: navLeave } = useNav();
  const [supabase] = useState(() => createClient());
  const [view, setView] = useState<View>("searching");
  const [waited, setWaited] = useState(0);
  const [waiting, setWaiting] = useState(0);
  // Ancla del reloj local: espera del server + instante local en que llegó.
  const anchorRef = useRef<{ waited: number; at: number }>({ waited: 0, at: 0 });
  const matchedRef = useRef(false);

  useEffect(() => {
    let active = true;
    anchorRef.current = { waited: 0, at: Date.now() };

    const handle = (r: RankedPoll | null): boolean => {
      if (!active || !r) return false;
      if (r.status === "matched") {
        matchedRef.current = true;
        setView("matched");
        navPush("/partido");
        return true;
      }
      if (r.status === "busy") {
        setView("busy");
        return true;
      }
      if (r.status === "queued") {
        anchorRef.current = { waited: r.waited_ms, at: Date.now() };
      }
      return r.status === "idle";
    };

    const enqueue = async () => {
      const { data, error } = await supabase.rpc("ranked_enqueue");
      if (!active) return;
      if (error) {
        setView("error");
        return;
      }
      handle(data);
    };

    void enqueue();
    const poll = setInterval(() => {
      if (matchedRef.current) return;
      void supabase.rpc("ranked_poll").then(({ data }) => {
        // `idle` = el server nos sacó de la cola (pestaña dormida) → volver a entrar.
        if (handle(data) && data?.status === "idle") void enqueue();
      });
    }, POLL_MS);
    const tick = setInterval(() => {
      const a = anchorRef.current;
      setWaited(a.waited + (Date.now() - a.at));
    }, 250);

    return () => {
      active = false;
      clearInterval(poll);
      clearInterval(tick);
      if (!matchedRef.current) void supabase.rpc("ranked_cancel");
    };
  }, [supabase, navPush]);

  // Presence: estar en esta pantalla = estar en la cola. Cada uno cuenta las keys que no son la suya.
  useEffect(() => {
    const channel = supabase.channel(RANKED_QUEUE_CHANNEL, { config: { presence: { key: userId } } });
    channel
      .on("presence", { event: "sync" }, () => setWaiting(othersWaiting(channel.presenceState(), userId)))
      .subscribe((status) => {
        if (status === "SUBSCRIBED") void channel.track({ at: Date.now() });
      });
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [supabase, userId]);

  // Cancelar navega YA; el cancel corre en paralelo (si se perdiera, el server te saca de la cola a
  // los 15s sin latido). Antes esperaba el RPC y el botón parecía colgado (feedback 14/11).
  function cancel() {
    matchedRef.current = true; // evita el doble cancel del cleanup
    navLeave("/jugar", () => supabase.rpc("ranked_cancel"));
  }

  return (
    <>
    <ScreenHeader onBack={cancel} backLabel="Cancelar" />
    <Page center>
    <div className="flex w-full max-w-sm flex-col items-center gap-6">
      <div className="flex flex-col items-center gap-1 text-center">
        <Eyebrow>Ranked · 1 contra 1</Eyebrow>
        <h2 className="font-display text-5xl font-black uppercase leading-[0.9] text-fg">
          {view === "matched" ? "¡Rival encontrado!" : "Buscando rival"}
        </h2>
      </div>

      <Card className="flex w-full flex-col gap-5">
        <DivisionProgress rating={me.rating} shield={me.shield} compact />

        {view === "searching" || view === "matched" ? (
          <>
            <div className="flex flex-col items-center gap-1 border-t-2 border-ink pt-4">
              <span
                className="font-display text-7xl font-black leading-none tabular-nums text-fg"
                aria-live="off"
              >
                {clock(waited)}
              </span>
              <span data-testid="ranked-waiting" className="text-sm font-semibold text-fg-muted" aria-live="polite">
                {waitingLabel(waiting)}
              </span>
            </div>
          </>
        ) : view === "busy" ? (
          <div className="flex flex-col items-center gap-3 text-center">
            <p className="text-sm font-semibold text-brand-ink">
              Ya estás en un torneo. Terminalo (o abandonalo) para jugar ranked.
            </p>
            <Link href="/partido" className={buttonVariants({ variant: "primary", size: "sm" })}>
              Volver al partido
            </Link>
          </div>
        ) : (
          <p className="text-center text-sm font-semibold text-brand-ink">
            No pudimos entrar a la cola. Revisá tu conexión y probá de nuevo.
          </p>
        )}
      </Card>

    </div>
    </Page>
    </>
  );
}
