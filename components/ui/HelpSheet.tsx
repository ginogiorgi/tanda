"use client";

import { useId, useRef } from "react";
import { Button, buttonVariants } from "@/components/ui/Button";
import type { HelpSection } from "@/lib/help/howto";
import type { ModeHelp } from "@/lib/modes";
import { cn } from "@/lib/cn";

/**
 * Hoja de ayuda (feedback 2, P6) — `<dialog>` nativo con `showModal()`: foco atrapado, Esc, fondo
 * inerte y foco de vuelta al disparador, sin dependencias. Bottom sheet en mobile, centrado desde
 * `md`. Se cierra con "Entendido", Esc o tocando afuera. El disparador es un "?" de 44 px (cards de
 * /jugar) o un botón outline `lg` ("Cómo jugar" en la home).
 */

const MODE_HELP_TITLES: Record<keyof ModeHelp, string> = {
  format: "Formato",
  players: "Rivales",
  win: "Cómo se gana",
  ranked: "Liga",
};

/** La ayuda de un modo, en secciones (mismo render que "Cómo jugar"); las vacías no se muestran. */
export function modeHelpSections(help: ModeHelp): HelpSection[] {
  return (Object.keys(MODE_HELP_TITLES) as (keyof ModeHelp)[]).flatMap((k) => {
    const body = help[k];
    return body ? [{ title: MODE_HELP_TITLES[k], body }] : [];
  });
}

export function HelpSheet({
  title,
  sections,
  trigger,
  label,
  className,
}: {
  title: string;
  sections: readonly HelpSection[];
  /** "icon" = "?" circular (lleva `label` accesible); "button" = botón outline con `label` visible. */
  trigger: "icon" | "button";
  label: string;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const close = () => ref.current?.close();

  return (
    <>
      {trigger === "icon" ? (
        <button
          type="button"
          aria-label={label}
          aria-haspopup="dialog"
          data-testid="help-button"
          onClick={() => ref.current?.showModal()}
          className={cn(
            "flex size-11 shrink-0 items-center justify-center rounded-full border-2 border-ink bg-bg-elevated font-display text-xl font-black text-fg shadow-card transition-colors hover:bg-ink hover:text-bg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue",
            className,
          )}
        >
          ?
        </button>
      ) : (
        <button
          type="button"
          aria-haspopup="dialog"
          onClick={() => ref.current?.showModal()}
          className={buttonVariants({ variant: "outline", size: "lg", className })}
        >
          {label}
        </button>
      )}
      <dialog
        ref={ref}
        data-layer="overlay"
        aria-labelledby={titleId}
        data-testid="help-sheet"
        // Tocar el backdrop: el target es el propio <dialog> (el contenido vive en el div de adentro).
        onClick={(e) => {
          if (e.target === e.currentTarget) close();
        }}
        className="help-sheet m-0 mt-auto max-h-[85svh] w-full max-w-none overflow-y-auto rounded-t-md border-2 border-b-0 border-ink bg-bg p-0 text-fg shadow-pop backdrop:bg-ink/50 md:m-auto md:max-w-md md:rounded-md md:border-b-2"
      >
        <div className="flex flex-col gap-4 p-5">
          <h2 id={titleId} className="font-display text-3xl font-extrabold uppercase leading-none">
            {title}
          </h2>
          <ol className="flex flex-col gap-3">
            {sections.map((s) => (
              <li key={s.title} className="flex flex-col gap-0.5">
                <span className="text-sm font-bold text-fg">{s.title}</span>
                <span className="text-sm leading-snug text-fg-muted">{s.body}</span>
              </li>
            ))}
          </ol>
          <Button type="button" size="lg" variant="outline" block onClick={close}>
            Entendido
          </Button>
        </div>
      </dialog>
    </>
  );
}
