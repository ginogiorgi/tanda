"use client";

/**
 * Pantalla de partido RANKED (Fase 4b). Mismo motor que un torneo (un único match `final` 1v1), con
 * tres momentos propios:
 *  1. Cara a cara (8s de presentación del server): las dos fichas + lo que está en juego.
 *  2. La tanda: `<PenalLive ranked>` (5 penales + muerte súbita, cada uno con su avatar).
 *  3. Resultado: puntos ganados/perdidos, barra de división, ascenso/descenso/escudo y "Otra ranked".
 *
 * El reloj lo gobierna el server: `get_active_match` decide si hay penal y el poke a
 * `open_next_round` (idempotente) arranca la tanda apenas vence la presentación (pg_cron = backstop).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { fire } from "@/lib/supabase/fire";
import { PenalLive } from "@/components/penal/PenalLive";
import { clockOffset, remainingMs, type ActiveMatch } from "@/lib/realtime/penal";
import { divisionFor } from "@/lib/engine/ranked";
import { signed, type RankedMatchView } from "@/lib/ranked/types";
import { Eyebrow } from "@/components/ui/Typography";
import { DivisionCrest } from "./DivisionCrest";
import { RankedResult } from "./RankedResult";
import { usePreload3D } from "@/components/penal/usePreload3D";
import { LATE_RESULT_GRACE_MS, lingerWaitMs } from "@/lib/engine/timing";
import { Page } from "@/components/ui/Page";


function Fighter({ username, rating, align }: { username: string; rating: number; align: "left" | "right" }) {
  const div = divisionFor(rating);
  return (
    <div className={`flex min-w-0 flex-1 flex-col gap-2 ${align === "right" ? "items-end text-right" : "items-start"}`}>
      <DivisionCrest id={div.id} className="h-20" />
      <span className="w-full truncate font-display text-2xl font-black uppercase leading-none text-fg">
        {username}
      </span>
      <span className="text-xs font-bold uppercase tracking-[0.1em] text-fg-muted">
        {div.name} · <span className="font-mono">{rating}</span>
      </span>
    </div>
  );
}

function Versus({ view, remaining }: { view: RankedMatchView; remaining: number }) {
  const { win, loss } = view.me.stakes;
  return (
    <div className="reveal-pop flex w-full max-w-md flex-col items-center gap-6">
      <Eyebrow>Ranked · Cara a cara</Eyebrow>
      <div className="flex w-full items-center gap-3 rounded-[6px] border-2 border-ink bg-bg-elevated p-4 shadow-pop">
        <Fighter username={view.me.username} rating={view.me.rating} align="left" />
        <span className="font-display text-4xl font-black text-brand">VS</span>
        <Fighter username={view.opp.username} rating={view.opp.rating} align="right" />
      </div>
      {/* La apuesta: lo que se gana o pierde antes de patear. */}
      <div className="grid w-full grid-cols-2 border-2 border-ink">
        <div className="flex flex-col items-center gap-0.5 bg-ink py-3 text-bg">
          <span className="text-xs font-bold uppercase tracking-[0.14em] opacity-80">Si ganás</span>
          <span className="font-display text-4xl font-black leading-none">{signed(win)}</span>
        </div>
        <div className="flex flex-col items-center gap-0.5 bg-bg-elevated py-3 text-fg">
          <span className="text-xs font-bold uppercase tracking-[0.14em] text-fg-muted">Si perdés</span>
          <span className="font-display text-4xl font-black leading-none text-brand-ink">{signed(loss)}</span>
        </div>
      </div>
      <p className="text-sm font-semibold text-fg-muted" aria-live="polite">
        {remaining > 0 ? `Arranca la tanda en ${Math.ceil(remaining / 1000)}…` : "¡Arranca la tanda!"}
      </p>
    </div>
  );
}

export function RankedLive({ tournamentId }: { tournamentId: string }) {
  usePreload3D(); // el primer penal no paga la descarga del 3D (F4)
  const [supabase] = useState(() => createClient());
  const [view, setView] = useState<RankedMatchView | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [matchId, setMatchId] = useState<string | null>(null);
  const [showPenal, setShowPenal] = useState(false);
  const [everPlayed, setEverPlayed] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [offset, setOffset] = useState(0);
  const showPenalRef = useRef(false);
  const lingerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Feedback 3 #12: el último cartel del partido se ve completo (jugada + 2,5 s) contando desde que LLEGÓ
  // su resultado, no desde que el poll notó el fin del partido.
  const lastResultAtRef = useRef(0);
  const onResult = useCallback((at: number) => {
    lastResultAtRef.current = at;
  }, []);
  const settledRef = useRef(false);

  // Vista del partido (fichas, apuesta y, al final, el resultado aplicado). Se deja de pedir al asentarse.
  useEffect(() => {
    let active = true;
    const load = async () => {
      if (settledRef.current) return;
      const { data, error } = await supabase.rpc("get_ranked_match", { p_tournament: tournamentId });
      if (!active) return;
      if (data) {
        setOffset(clockOffset(data.server_now));
        settledRef.current = data.settled;
        setView(data);
      } else if (error) {
        setLoadError(true);
      }
    };
    void load();
    const id = setInterval(() => void load(), 1500);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [supabase, tournamentId]);

  // ¿Hay penal? (misma lógica que TournamentLive: me quedo en la escena entre penales del match).
  useEffect(() => {
    let active = true;
    const poll = async () => {
      const { data } = await supabase.rpc("get_active_match");
      if (!active) return;
      const am = data as ActiveMatch | null;
      if (am?.penal == null) fire(supabase.rpc("open_next_round", { p_tournament: tournamentId }));
      if (am?.match_id) {
        if (lingerRef.current) {
          clearTimeout(lingerRef.current);
          lingerRef.current = null;
        }
        setMatchId(am.match_id);
        setShowPenal(true);
        setEverPlayed(true);
        showPenalRef.current = true;
      } else if (showPenalRef.current && !lingerRef.current) {
        const release = () => {
          const wait = lingerWaitMs(lastResultAtRef.current, Date.now());
          if (wait > 0) {
            lingerRef.current = setTimeout(release, wait);
            return;
          }
          setShowPenal(false);
          showPenalRef.current = false;
          lingerRef.current = null;
        };
        lingerRef.current = setTimeout(release, LATE_RESULT_GRACE_MS);
      }
    };
    void poll();
    const id = setInterval(() => void poll(), 1000);
    return () => {
      active = false;
      clearInterval(id);
      if (lingerRef.current) clearTimeout(lingerRef.current);
    };
  }, [supabase, tournamentId]);

  // Cuenta regresiva de la presentación.
  useEffect(() => {
    if (everPlayed) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [everPlayed]);

  if (showPenal && matchId) return <PenalLive key={matchId} matchId={matchId} ranked onResult={onResult} />;

  return <Page center>{rankedBody(view, loadError, everPlayed, offset, now)}</Page>;
}

/** Lo que va en la pantalla del partido ranked fuera de la tanda (en un `Page`, no en el stage). */
function rankedBody(
  view: RankedMatchView | null,
  loadError: boolean,
  everPlayed: boolean,
  offset: number,
  now: number,
): React.ReactNode {
  if (!view) {
    return (
      <p className="text-sm text-fg-subtle">
        {loadError ? "No pudimos cargar el partido. Recargá la página." : "Cargando el partido…"}
      </p>
    );
  }
  if (view.settled && view.me.result) return <RankedResult view={view} result={view.me.result} />;
  if (everPlayed || view.status === "finished") {
    return <p className="text-sm font-semibold text-fg-muted">Sumando los puntos…</p>;
  }
  const remaining = view.starts_at ? remainingMs(view.starts_at, offset, now) : 0;
  return <Versus view={view} remaining={remaining} />;
}
