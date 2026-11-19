"use client";

import { useId, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { FEEDBACK_MAX, FEEDBACK_MIN, type FeedbackKind } from "@/lib/feedback/report";
import { cn } from "@/lib/cn";

/**
 * Reportar un bug / pedir una mejora (feedback 3 #17). Botón flotante abajo a la derecha (solo home y
 * pantallas de menú; nunca en juego, sala ni cola) que abre una hoja `<dialog>` como `HelpSheet`: tipo
 * (Bug / Mejora) + texto con contador, honeypot oculto, envío a `POST /api/feedback` y confirmación.
 */

type Status = "idle" | "sending" | "sent";

const KINDS: { id: FeedbackKind; label: string; hint: string }[] = [
  { id: "bug", label: "Bug", hint: "Algo anda mal" },
  { id: "idea", label: "Mejora", hint: "Tengo una idea" },
];

const ERRORS: Record<string, string> = {
  too_short: "Contanos un poco más.",
  too_long: `Máximo ${FEEDBACK_MAX} caracteres.`,
  rate_limited: "Mandaste varios reportes seguidos. Probá de nuevo en un rato.",
};
const GENERIC_ERROR = "No pudimos mandarlo. Revisá tu conexión y probá de nuevo.";

export function FeedbackButton() {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const textId = useId();
  const counterId = useId();
  const [kind, setKind] = useState<FeedbackKind>("bug");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);

  const length = [...message].length;
  const tooShort = message.trim().length < FEEDBACK_MIN;

  function open() {
    if (status === "sent") {
      setStatus("idle");
      setMessage("");
      setKind("bug");
    }
    setError(null);
    ref.current?.showModal();
  }
  const close = () => ref.current?.close();

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (status === "sending") return;
    const website = new FormData(e.currentTarget).get("website");
    setError(null);
    setStatus("sending");
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          kind,
          message,
          website: typeof website === "string" ? website : "",
          route: `${window.location.pathname}${window.location.search}`.slice(0, 200),
          client: {
            viewport: { w: window.innerWidth, h: window.innerHeight },
            screen: { w: window.screen.width, h: window.screen.height, dpr: window.devicePixelRatio },
            lang: navigator.language,
            tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
          },
        }),
      });
      const data: unknown = await res.json().catch(() => null);
      const errCode =
        typeof data === "object" && data !== null && "error" in data && typeof data.error === "string" ? data.error : null;
      if (!res.ok || errCode) {
        setStatus("idle");
        setError((errCode && ERRORS[errCode]) ?? GENERIC_ERROR);
        return;
      }
      setStatus("sent");
    } catch {
      setStatus("idle");
      setError(GENERIC_ERROR);
    }
  }

  return (
    <div data-layer="overlay">
      <button
        type="button"
        onClick={open}
        aria-haspopup="dialog"
        aria-label="Reportar un bug o pedir una mejora"
        data-testid="feedback-button"
        className="fixed bottom-[calc(1rem+env(safe-area-inset-bottom))] right-4 z-30 flex h-11 min-w-11 items-center justify-center gap-2 rounded-full border-2 border-ink bg-bg-elevated px-3 font-display text-base font-extrabold uppercase tracking-[0.06em] text-fg shadow-card transition-colors hover:bg-ink hover:text-bg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue motion-safe:active:translate-x-[2px] motion-safe:active:translate-y-[2px] active:shadow-press"
      >
        {/* Globo de diálogo con "!" (2D, tinta). */}
        <svg viewBox="0 0 24 24" aria-hidden className="size-5 shrink-0" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinejoin="round">
          <path d="M4 5h16v11H10l-4.5 3.5V16H4z" />
          <path d="M12 8v4" strokeLinecap="round" />
          <circle cx={12} cy={14.2} r={0.4} fill="currentColor" />
        </svg>
        <span className="hidden sm:inline">Reportar</span>
      </button>

      <dialog
        ref={ref}
        aria-labelledby={titleId}
        data-testid="feedback-sheet"
        onClick={(e) => {
          if (e.target === e.currentTarget) close();
        }}
        className="help-sheet m-0 mt-auto max-h-[90svh] w-full max-w-none overflow-y-auto rounded-t-md border-2 border-b-0 border-ink bg-bg p-0 text-fg shadow-pop backdrop:bg-ink/50 md:m-auto md:max-w-md md:rounded-md md:border-b-2"
      >
        {status === "sent" ? (
          <div className="flex flex-col gap-4 p-5" role="status">
            <h2 id={titleId} className="font-display text-3xl font-extrabold uppercase leading-none">
              ¡Gracias!
            </h2>
            <p className="text-sm leading-snug text-fg-muted">
              {kind === "bug"
                ? "Recibimos tu reporte. Lo vamos a mirar para arreglarlo."
                : "Recibimos tu idea. La vamos a leer con atención."}
            </p>
            <Button type="button" size="lg" variant="outline" block onClick={close}>
              Cerrar
            </Button>
          </div>
        ) : (
          <form className="flex flex-col gap-4 p-5" onSubmit={(e) => void submit(e)} noValidate>
            <h2 id={titleId} className="font-display text-3xl font-extrabold uppercase leading-none">
              Contanos
            </h2>

            <fieldset className="flex flex-col gap-1.5">
              <legend className="mb-1.5 text-xs font-bold uppercase tracking-[0.12em] text-fg">¿Qué querés contar?</legend>
              <div className="grid grid-cols-2 gap-2">
                {KINDS.map((k) => (
                  <label
                    key={k.id}
                    className={cn(
                      "flex min-h-14 cursor-pointer flex-col items-center justify-center rounded-[4px] border-2 border-ink px-3 py-2 text-center transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-blue has-[:focus-visible]:ring-offset-2 has-[:focus-visible]:ring-offset-bg",
                      kind === k.id ? "bg-ink text-bg shadow-none" : "bg-bg-elevated text-fg shadow-card hover:bg-bg-raised",
                    )}
                  >
                    <input
                      type="radio"
                      name="kind"
                      value={k.id}
                      checked={kind === k.id}
                      onChange={() => setKind(k.id)}
                      className="sr-only"
                    />
                    <span className="font-display text-xl font-extrabold uppercase leading-none tracking-[0.04em]">{k.label}</span>
                    <span className={cn("text-xs", kind === k.id ? "text-bg" : "text-fg-muted")}>{k.hint}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            <div className="flex flex-col gap-1.5">
              <label htmlFor={textId} className="text-xs font-bold uppercase tracking-[0.12em] text-fg">
                {kind === "bug" ? "¿Qué pasó y dónde?" : "¿Qué te gustaría?"}
              </label>
              <textarea
                id={textId}
                name="message"
                required
                rows={5}
                maxLength={FEEDBACK_MAX}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                aria-describedby={counterId}
                aria-invalid={error ? true : undefined}
                placeholder={kind === "bug" ? "Ej.: en la sala no aparecía mi nombre…" : "Ej.: que se pueda elegir el arquero…"}
                className="w-full resize-y rounded-[4px] border-2 border-ink bg-bg-raised px-4 py-3 text-base text-fg placeholder:text-fg-subtle transition-shadow focus:shadow-card focus:outline-none"
              />
              <div className="flex items-start justify-between gap-3 text-xs">
                <p className="font-semibold text-brand-ink" role="alert">
                  {error}
                </p>
                <span id={counterId} className="shrink-0 font-mono text-fg-subtle">
                  {length}/{FEEDBACK_MAX}
                </span>
              </div>
            </div>

            {/* Honeypot: invisible para personas (y para lectores de pantalla); los bots lo llenan. */}
            <div aria-hidden className="absolute -left-[9999px] h-px w-px overflow-hidden">
              <label>
                No completar
                <input type="text" name="website" tabIndex={-1} autoComplete="off" defaultValue="" />
              </label>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Button type="button" size="lg" variant="outline" onClick={close}>
                Cancelar
              </Button>
              <Button type="submit" size="lg" disabled={status === "sending" || tooShort}>
                {status === "sending" ? "Enviando…" : "Enviar"}
              </Button>
            </div>
            <p className="text-xs leading-snug text-fg-subtle">
              Junto con tu mensaje mandamos la pantalla, el navegador y la versión del juego para poder reproducirlo.
            </p>
          </form>
        )}
      </dialog>
    </div>
  );
}
