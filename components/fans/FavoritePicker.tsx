"use client";

import { useId, useRef, useState } from "react";
import { TeamMark } from "@/components/common/TeamMark";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { FAV_LABEL, FAV_TEAMS, favByCode, searchFav, type FavKind } from "@/lib/fans/catalog";
import { cn } from "@/lib/cn";

/**
 * Selector buscable de club / país favorito (feedback 3 #15). Disparador con el escudo o la bandera elegida;
 * abre una hoja `<dialog>` (como `HelpSheet`) con buscador y la lista de botones (`aria-pressed` = el elegido).
 * Elegir cierra la hoja y avisa por `onChange`.
 */
export function FavoritePicker({
  kind,
  value,
  onChange,
  invalid,
  disabled,
  className,
}: {
  kind: FavKind;
  value: string | null;
  onChange: (code: string) => void;
  invalid?: boolean;
  disabled?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const titleId = useId();
  const labelId = useId();
  const [query, setQuery] = useState("");
  const selected = favByCode(kind, value);
  const results = searchFav(FAV_TEAMS[kind], query);
  const placeholder = kind === "club" ? "Elegí tu club" : "Elegí tu país";

  function open() {
    setQuery("");
    ref.current?.showModal();
    searchRef.current?.focus();
  }
  function pick(code: string) {
    onChange(code);
    ref.current?.close();
  }

  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <span id={labelId} className="text-xs font-bold uppercase tracking-[0.12em] text-fg">
        {FAV_LABEL[kind]}
      </span>
      <button
        type="button"
        onClick={open}
        disabled={disabled}
        aria-haspopup="dialog"
        aria-labelledby={labelId}
        aria-describedby={`${labelId}-value`}
        data-invalid={invalid || undefined}
        data-testid={`fav-${kind}`}
        className={cn(
          "flex h-13 w-full min-w-0 items-center gap-3 rounded-[4px] border-2 border-ink bg-bg-raised px-3 text-left text-base text-fg transition-shadow hover:shadow-card focus-visible:shadow-card focus-visible:outline-none disabled:opacity-50",
          invalid && "border-danger",
        )}
      >
        {selected ? (
          <TeamMark flag={selected.flag} crest={selected.crest} className="h-7" />
        ) : (
          <span aria-hidden className="size-7 shrink-0 rounded-full border-2 border-dashed border-ink/40" />
        )}
        <span id={`${labelId}-value`} className={cn("min-w-0 flex-1 truncate", selected ? "font-semibold" : "text-fg-subtle")}>
          {selected ? selected.name : placeholder}
          {invalid && <span className="sr-only"> — falta elegir</span>}
        </span>
        <span aria-hidden className="font-display text-lg leading-none text-fg-muted">
          ▾
        </span>
      </button>

      <dialog
        ref={ref}
        aria-labelledby={titleId}
        data-testid={`fav-sheet-${kind}`}
        onClick={(e) => {
          if (e.target === e.currentTarget) ref.current?.close();
        }}
        className="help-sheet m-0 mt-auto max-h-[85svh] w-full max-w-none rounded-t-md border-2 border-b-0 border-ink bg-bg p-0 text-fg shadow-pop backdrop:bg-ink/50 md:m-auto md:max-w-md md:rounded-md md:border-b-2"
      >
        <div className="flex max-h-[85svh] flex-col gap-3 p-5">
          <h2 id={titleId} className="font-display text-3xl font-extrabold uppercase leading-none">
            {FAV_LABEL[kind]}
          </h2>
          <Input
            ref={searchRef}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={kind === "club" ? "Buscá tu club" : "Buscá tu país"}
            aria-label={kind === "club" ? "Buscar club" : "Buscar país"}
            autoComplete="off"
          />
          <div data-layer="card" className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1">
            {results.length === 0 ? (
              <p className="py-6 text-center text-sm text-fg-muted">No encontramos “{query}”.</p>
            ) : (
              <ul className="flex flex-col gap-1.5 py-1" aria-label={FAV_LABEL[kind]}>
                {results.map((t) => (
                  <li key={t.code}>
                    <button
                      type="button"
                      aria-pressed={t.code === value}
                      onClick={() => pick(t.code)}
                      className={cn(
                        "flex min-h-12 w-full items-center gap-3 rounded-[4px] border-2 px-3 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue",
                        t.code === value ? "border-ink bg-ink text-bg" : "border-transparent hover:border-ink hover:bg-bg-elevated",
                      )}
                    >
                      <TeamMark flag={t.flag} crest={t.crest} className="h-7" />
                      <span className="font-semibold">{t.name}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <Button type="button" variant="outline" size="lg" block onClick={() => ref.current?.close()}>
            Cancelar
          </Button>
        </div>
      </dialog>
    </div>
  );
}
