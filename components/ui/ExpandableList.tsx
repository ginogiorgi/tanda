"use client";

import { useId, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * Lista plegable con el botón SIEMPRE al final (feedback 4 #1). No usar `<details>` para esto: su
 * `<summary>` va primero por spec, así que al abrirlo el "Ver menos" queda en el medio de la lista.
 *
 * - `head`: lo que se ve siempre. `rest`: lo que se despliega, a continuación, en la MISMA lista.
 * - `collapsedTail`: solo plegada (p. ej. "tu fila" fuera del top); al desplegar no se repite.
 * - Al plegar, si el comienzo de la lista quedó fuera de pantalla, vuelve a mostrarlo (el usuario
 *   tocó el botón del final; sin esto el documento "salta" a otra sección).
 */
export function ExpandableList({
  head,
  rest,
  collapsedTail,
  moreLabel,
  lessLabel = "Ver menos",
  className,
}: {
  head: ReactNode;
  rest: ReactNode;
  collapsedTail?: ReactNode;
  moreLabel: string;
  lessLabel?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const listRef = useRef<HTMLOListElement>(null);
  const id = useId();

  function toggle() {
    const next = !open;
    setOpen(next);
    if (!next) {
      const el = listRef.current;
      if (el && el.getBoundingClientRect().top < 0) el.scrollIntoView({ block: "start" });
    }
  }

  return (
    <>
      <ol ref={listRef} id={id} className={className}>
        {head}
        {open ? rest : collapsedTail}
      </ol>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={toggle}
        className={cn(
          "w-full border-t-2 border-ink px-3 py-2 text-center text-sm font-bold uppercase tracking-[0.08em]",
          "text-fg-muted transition-colors hover:bg-bg-overlay hover:text-fg focus-visible:outline-2 focus-visible:outline-ring",
        )}
      >
        {open ? lessLabel : moreLabel}
      </button>
    </>
  );
}
