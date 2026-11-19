"use client";

import { useState } from "react";
import { useNav } from "@/lib/nav/useNav";
import { browserClient } from "@/lib/supabase/lazy";
import { roomErrorMessage, GENERIC_RETRY_MESSAGE } from "@/lib/errors";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { MODE_LIST, PLAY_KINDS, type ModeId } from "@/lib/modes";
import { HelpSheet, modeHelpSections } from "@/components/ui/HelpSheet";
import { divisionFor } from "@/lib/engine/ranked";
import type { RankedMe } from "@/lib/ranked/types";
import { DivisionCrest } from "@/components/ranked/DivisionCrest";
import { SectionTitle } from "@/components/ui/Typography";

/** Las RPC de matchmaking devuelven `TABLE(room_id, tournament_id, code)`. */
type RoomRef = { room_id: string; tournament_id: string; code: string };
type Action = "play" | "create";

const ACTION_LABEL: Record<Action, { title: string; busy: string }> = {
  play: { title: "Jugar", busy: "Buscando…" },
  create: { title: "Crear sala", busy: "Creando…" },
};

/**
 * Pantalla `/jugar` (feedback 14/11: la home acumulaba todo al mismo nivel). Tres caminos, cada uno en
 * su sección: PARTIDA RÁPIDA (modos a la vista, un toque y estás en una sala) + RANKED 1v1, y CON
 * AMIGOS (crear sala → elegís el modo; o unirte con un código, que no pregunta modo: lo define la
 * sala). Los modos salen del registro `lib/modes` + los activos de `game_modes` (server).
 */
export function PlayMenu({
  activeModes,
  ranked = null,
}: {
  activeModes: readonly ModeId[];
  /** Ficha de liga del jugador (null = no se pudo cargar; la card igual lleva a la cola). */
  ranked?: RankedMe | null;
}) {
  const router = useNav();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  type Supabase = Awaited<ReturnType<typeof browserClient>>;
  async function go(
    key: string,
    rpc: (supabase: Supabase) => PromiseLike<{ data: unknown; error: { message: string } | null }>,
  ) {
    setError(null);
    setBusy(key);
    const { data, error: rpcError } = await rpc(await browserClient());
    if (rpcError) {
      setBusy(null);
      setError(roomErrorMessage(rpcError.message));
      return;
    }
    const ref = (data as RoomRef[])?.[0];
    if (!ref) {
      setBusy(null);
      setError(GENERIC_RETRY_MESSAGE);
      return;
    }
    router.push(`/sala/${ref.code}`);
  }

  function start(action: Action, mode: ModeId) {
    void go(`${action}:${mode}`, (supabase) =>
      supabase.rpc(action === "play" ? "quick_play" : "create_room", { p_mode: mode }),
    );
  }

  const modeGrid = (action: Action) => (
    <div
      id={`modes-${action}`}
      role="group"
      aria-label={`Elegí el modo para ${ACTION_LABEL[action].title.toLowerCase()}`}
      className="grid grid-cols-2 gap-2"
    >
      {MODE_LIST.map((mode) => {
        const enabled = activeModes.includes(mode.id);
        const key = `${action}:${mode.id}`;
        return (
          // P6: cada card lleva su "?" (hermano del botón, no anidado). Solo en Partida rápida: la
          // grilla de "Crear sala" repite los mismos modos.
          <div key={mode.id} className="relative flex">
          <button
            type="button"
            onClick={() => start(action, mode.id)}
            disabled={!enabled || busy !== null}
            className="group relative flex min-h-26 w-full flex-col items-start justify-between gap-2 overflow-hidden rounded-[4px] border-2 border-ink bg-bg-elevated p-3 pt-4 pr-13 text-left shadow-card transition-colors hover:bg-ink hover:text-bg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue motion-safe:active:translate-x-[2px] motion-safe:active:translate-y-[2px] active:shadow-press disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-bg-elevated disabled:hover:text-fg"
          >
            {/* Filete superior con el color del modo (sub-identidad). */}
            <span aria-hidden className={`absolute inset-x-0 top-0 h-1.5 ${mode.swatch}`} />
            <span className="font-display text-2xl font-extrabold uppercase leading-[0.9]">
              {busy === key ? ACTION_LABEL[action].busy : mode.name}
            </span>
            <span className="text-xs font-medium leading-snug opacity-75">
              {enabled ? mode.tagline : "Próximamente"}
            </span>
          </button>
          {action === "play" && (
            <HelpSheet
              trigger="icon"
              label={`Cómo se juega ${mode.name}`}
              title={mode.name}
              sections={modeHelpSections(mode.help)}
              className="absolute right-1.5 top-3"
            />
          )}
          </div>
        );
      })}
      {action === "play" && <RankedCard ranked={ranked} disabled={busy !== null} />}
    </div>
  );

  return (
    <div className="flex w-full flex-col gap-8">
      {error && (
        <p role="alert" className="rounded-[4px] border-2 border-ink bg-bg-elevated px-3 py-2 text-sm font-semibold text-brand-ink">
          {error}
        </p>
      )}

      <section className="flex flex-col gap-3">
        <SectionTitle>Partida rápida</SectionTitle>
        <p className="text-sm text-fg-muted">Elegí el modo y entrás a un torneo con quien esté jugando.</p>
        {modeGrid("play")}
      </section>

      <section className="flex flex-col gap-3">
        <SectionTitle>Con amigos</SectionTitle>
        <Button
          onClick={() => {
            setError(null);
            setCreating((c) => !c);
          }}
          disabled={busy !== null}
          variant="outline"
          block
          size="lg"
          aria-expanded={creating}
          aria-controls="modes-create"
        >
          {ACTION_LABEL.create.title}
        </Button>
        {creating && <div className="fade-in">{modeGrid("create")}</div>}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            const value = code.trim().toUpperCase();
            if (value.length < 6) {
              setError("El código tiene 6 caracteres.");
              return;
            }
            void go("join", (supabase) => supabase.rpc("join_room", { p_code: value }));
          }}
          className="flex w-full gap-2"
        >
          <Input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            maxLength={6}
            placeholder="CÓDIGO"
            aria-label="Código de sala"
            className="text-center font-mono tracking-[0.2em]"
          />
          <Button type="submit" disabled={busy !== null} variant="outline" size="lg" className="shrink-0">
            {busy === "join" ? "…" : "Unirse"}
          </Button>
        </form>
      </section>
    </div>
  );
}

/** Tercera cola, solo en Jugar: ranked 1v1 con la división y los puntos del jugador. */
function RankedCard({ ranked, disabled }: { ranked: RankedMe | null; disabled: boolean }) {
  const router = useNav();
  const div = divisionFor(ranked?.rating ?? 1500);
  return (
    // Feedback 3 #8: el "?" vive ADENTRO de la card, como en los modos (hermano del botón, no anidado).
    <div className="relative col-span-2 flex">
      <button
        type="button"
        onClick={() => router.push("/ranked")}
        disabled={disabled}
        className="group flex min-w-0 flex-1 items-center gap-3 rounded-[4px] border-2 border-ink bg-ink p-3 pr-13 text-left text-bg shadow-card transition-colors hover:bg-bg-elevated hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue motion-safe:active:translate-x-[2px] motion-safe:active:translate-y-[2px] active:shadow-press disabled:cursor-not-allowed disabled:opacity-45"
      >
        <DivisionCrest id={div.id} className="h-12" />
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="font-display text-2xl font-extrabold uppercase leading-[0.9]">Ranked 1v1</span>
          <span className="text-xs font-medium leading-snug opacity-75">
            {div.name} · {ranked?.rating ?? 1500} pts · ganás o perdés puntos
          </span>
        </span>
      </button>
      <HelpSheet
        trigger="icon"
        label={`Cómo se juega ${PLAY_KINDS.ranked.name}`}
        title={PLAY_KINDS.ranked.name}
        sections={modeHelpSections(PLAY_KINDS.ranked.help)}
        className="absolute right-1.5 top-1/2 -translate-y-1/2"
      />
    </div>
  );
}
