"use client";

/**
 * Cola ranked (Fase 4b). Al montar se encola (`ranked_enqueue`) y hace poll cada 2s (`ranked_poll`,
 * que también es el latido: sin poll el server te saca a los 15s). La ventana de rating se abre
 * con la espera (±100 → ±250 a los 10s → cualquier humano a los 20s) y se ve en pantalla. Al
 * emparejar → /partido. Al salir sin rival, cancela. El emparejamiento lo decide el server.
 */

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { queueWindow } from "@/lib/engine/ranked";
import type { RankedMe, RankedPoll } from "@/lib/ranked/types";
import { Button, buttonVariants } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Eyebrow } from "@/components/ui/Typography";
import { DivisionProgress } from "./DivisionProgress";

const POLL_MS = 2000;

const STAGES = [
  { label: "±100", from: 0 },
  { label: "±250", from: 10 },
  { label: "Cualquiera", from: 20 },
] as const;

type View = "searching" | "matched" | "busy" | "error";

function clock(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function RankedQueue({ me }: { me: RankedMe }) {
  const router = useRouter();
  const [supabase] = useState(() => createClient());
  const [view, setView] = useState<View>("searching");
  const [waited, setWaited] = useState(0);
  const [inQueue, setInQueue] = useState<number | null>(null);
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
        router.push("/partido");
        return true;
      }
      if (r.status === "busy") {
        setView("busy");
        return true;
      }
      if (r.status === "queued") {
        anchorRef.current = { waited: r.waited_ms, at: Date.now() };
        setInQueue(r.in_queue);
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
  }, [supabase, router]);

  async function cancel() {
    matchedRef.current = true; // evita el doble cancel del cleanup
    await supabase.rpc("ranked_cancel");
    router.push("/");
  }

  const seconds = waited / 1000;
  const window = queueWindow(seconds);

  return (
    <div className="flex w-full max-w-sm flex-col items-center gap-6">
      <div className="flex flex-col items-center gap-1 text-center">
        <Eyebrow>Ranked · 1 contra 1</Eyebrow>
        <h1 className="font-display text-5xl font-black uppercase leading-[0.9] text-fg">
          {view === "matched" ? "¡Rival encontrado!" : "Buscando rival"}
        </h1>
      </div>

      <Card className="flex w-full flex-col gap-5">
        <DivisionProgress rating={me.rating} placementLeft={me.placement_left} shield={me.shield} compact />

        {view === "searching" || view === "matched" ? (
          <>
            <div className="flex flex-col items-center gap-1 border-y-2 border-ink py-4">
              <span
                className="font-display text-7xl font-black leading-none tabular-nums text-fg"
                aria-live="off"
              >
                {clock(waited)}
              </span>
              <span className="text-xs font-semibold text-fg-muted" aria-live="polite">
                {window === null
                  ? "Abrimos a cualquier rival humano"
                  : `De tu nivel: ${me.rating - window}–${me.rating + window} pts`}
              </span>
            </div>

            {/* La ventana se abre con la espera: el tramo actual va lleno. */}
            <ol className="grid grid-cols-3 gap-1.5" aria-label="Rango de búsqueda">
              {STAGES.map((s, i) => {
                const on = seconds >= s.from;
                const current = on && (STAGES[i + 1] === undefined || seconds < STAGES[i + 1]!.from);
                return (
                  <li
                    key={s.label}
                    className={`flex flex-col items-center gap-0.5 rounded-[4px] border-2 border-ink px-1 py-1.5 transition-colors ${
                      current ? "bg-ink text-bg" : on ? "bg-bg-raised text-fg" : "bg-transparent text-fg-subtle"
                    }`}
                  >
                    <span className="font-display text-lg font-extrabold uppercase leading-none">{s.label}</span>
                    <span className="text-xs font-semibold opacity-75">
                      {s.from === 0 ? "ya" : `a los ${s.from}s`}
                    </span>
                  </li>
                );
              })}
            </ol>

            <p className="text-center text-xs text-fg-muted">
              Solo humanos · 5 penales + muerte súbita · Abandonar = derrota
              {inQueue !== null && inQueue > 1 && ` · ${inQueue} en la cola`}
            </p>
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

      <div className="flex w-full gap-3">
        <Button variant="outline" block onClick={cancel} disabled={view === "matched"}>
          Cancelar
        </Button>
        <Link href="/ranking" className={buttonVariants({ variant: "ghost", className: "shrink-0" })}>
          Tabla
        </Link>
      </div>
    </div>
  );
}
