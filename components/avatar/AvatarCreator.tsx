"use client";

/**
 * Creador de avatar (feedback 2, P7d). Personaje arriba (~55dvh en mobile; drag para rotar, pinch para
 * zoom) y abajo el panel con pestañas **Cuerpo · Piel · Pelo · Equipo · Botines**: cada pestaña lleva la
 * cámara a lo que edita (`data-focus` en el contenedor: head/feet/body). Siempre visibles: Aleatorio,
 * Deshacer y Guardar (la única primaria). La primera vez (`firstTime`, viniendo del registro) arriba de
 * todo, 8 puntos de partida + aleatorio. Todo lo elegible sale del catálogo (`lib/avatar/catalog`).
 */

import { useCallback, useRef, useState } from "react";
import { useNav } from "@/lib/nav/useNav";
import { BODY_TYPES, PALETTES, hairFor, hairOptionsFor } from "@/lib/avatar/catalog";
import type { Swatch } from "@/lib/avatar/palette";
import { PRESETS, randomAvatar } from "@/lib/avatar/presets";
import { DEFAULT_AVATAR, type AvatarV2 } from "@/lib/avatar/schema";
import type { SaveAvatarResult } from "@/app/(app)/avatar/actions";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { AvatarViewer } from "./AvatarViewer";
import type { AvatarFocus } from "./AvatarCanvas";

type Tab = "body" | "skin" | "hair" | "kit" | "boots";

const TABS: readonly { id: Tab; label: string; focus: AvatarFocus; icon: React.ReactNode }[] = [
  {
    id: "body",
    label: "Cuerpo",
    focus: "body",
    icon: <path d="M12 3a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5Zm-4 7h8l-1 6h-1.5l-.5 5h-3l-.5-5H9l-1-6Z" />,
  },
  {
    id: "skin",
    label: "Piel",
    focus: "head",
    icon: <path d="M12 3a7 7 0 0 1 7 7c0 5-4 11-7 11S5 15 5 10a7 7 0 0 1 7-7Zm-3 9h.01M15 12h.01" />,
  },
  {
    id: "hair",
    label: "Pelo",
    focus: "head",
    icon: <path d="M5 13c0-5 3-9 7-9s7 4 7 9c-2-3-5-4-7-4s-5 1-7 4Zm2 1a5 5 0 0 0 10 0" />,
  },
  {
    id: "kit",
    label: "Equipo",
    focus: "body",
    icon: <path d="m8 3-5 3 2 4 2-1v12h10V9l2 1 2-4-5-3c-.5 1.5-2 2.5-4 2.5S8.5 4.5 8 3Z" />,
  },
  {
    id: "boots",
    label: "Botines",
    focus: "feet",
    icon: <path d="M4 7h6l1 5 8 2c1 .3 2 1.2 2 2.5V18H4V7Zm2 13h2m4 0h2m4 0h2" />,
  },
];

interface AvatarCreatorProps {
  initial?: AvatarV2;
  /** Server Action que persiste el avatar. Si falta, no se muestra el botón. */
  onSave?: (avatar: AvatarV2) => Promise<SaveAvatarResult>;
  /** Si se pasa, al guardar con éxito navega a esta ruta (p. ej. "/perfil"). */
  redirectTo?: string;
  /** Viene del registro: ofrece los puntos de partida arriba. */
  firstTime?: boolean;
}

export function AvatarCreator({ initial = DEFAULT_AVATAR, onSave, redirectTo, firstTime = false }: AvatarCreatorProps) {
  const router = useNav();
  const [avatar, setAvatar] = useState<AvatarV2>(initial);
  const [history, setHistory] = useState<AvatarV2[]>([]);
  const [tab, setTab] = useState<Tab>("body");
  const [rotationY, setRotationY] = useState(0.4);
  const [zoom, setZoom] = useState(1);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const focus = TABS.find((t) => t.id === tab)!.focus;

  const apply = (next: AvatarV2) => {
    setSaved(false);
    setHistory((h) => [...h.slice(-29), avatar]);
    setAvatar(next);
  };
  const undo = () => {
    const prev = history.at(-1);
    if (!prev) return;
    setSaved(false);
    setHistory((h) => h.slice(0, -1));
    setAvatar(prev);
  };

  const handleSave = useCallback(async () => {
    if (!onSave) return;
    setSaving(true);
    setSaveError(null);
    setSaved(false);
    try {
      const result = await onSave(avatar);
      if (!result.ok) {
        setSaveError(result.error ?? "No se pudo guardar.");
        setSaving(false);
        return;
      }
      if (redirectTo) {
        router.push(redirectTo);
        router.refresh();
        return;
      }
      setSaved(true);
      setSaving(false);
    } catch {
      setSaveError("No se pudo guardar. Probá de nuevo.");
      setSaving(false);
    }
  }, [onSave, avatar, redirectTo, router]);

  // Un dedo rota; dos dedos (pinch) acercan/alejan.
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<number | null>(null);
  const onPointerDown = (e: React.PointerEvent) => {
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const prev = pointers.current.get(e.pointerId);
    if (!prev) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pts = [...pointers.current.values()];
    if (pts.length === 2) {
      const d = Math.hypot(pts[0]!.x - pts[1]!.x, pts[0]!.y - pts[1]!.y);
      if (pinch.current) setZoom((z) => Math.min(1.4, Math.max(0.6, z * (pinch.current! / d))));
      pinch.current = d;
      return;
    }
    setRotationY((r) => r + (e.clientX - prev.x) * 0.01);
  };
  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    e.currentTarget.releasePointerCapture(e.pointerId);
  };

  const shuffle = () => apply(randomAvatar(Math.random));

  return (
    <div className="flex w-full flex-col gap-4 lg:flex-row lg:items-start">
      <div
        data-focus={focus}
        data-testid="avatar-stage"
        className="h-[55dvh] w-full cursor-grab touch-none select-none rounded-[6px] border-2 border-ink bg-bg-raised shadow-card active:cursor-grabbing lg:h-[70dvh] lg:w-1/2"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <AvatarViewer config={avatar} rotationY={rotationY} focus={focus} zoom={zoom} className="h-full w-full" />
      </div>

      <div className="flex w-full flex-col gap-3 lg:w-1/2">
        {firstTime && (
          <section aria-labelledby="presets-title" className="flex flex-col gap-2">
            <h3 id="presets-title" className="font-display text-xl font-extrabold uppercase text-fg">
              Elegí un punto de partida
            </h3>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
              {PRESETS.map((pr) => (
                <button
                  key={pr.label}
                  type="button"
                  onClick={() => apply(pr.avatar)}
                  className="flex flex-col items-center gap-1 rounded-[4px] border-2 border-ink bg-bg-elevated p-2 text-xs font-semibold text-fg hover:bg-bg-raised"
                >
                  <PresetChip avatar={pr.avatar} />
                  {pr.label}
                </button>
              ))}
            </div>
          </section>
        )}

        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" onClick={shuffle} className="flex-1">
            <svg aria-hidden viewBox="0 0 24 24" className="size-5 fill-none stroke-current stroke-2">
              <rect x="4" y="4" width="16" height="16" rx="3" />
              <circle cx="9" cy="9" r="1" className="fill-current" />
              <circle cx="15" cy="15" r="1" className="fill-current" />
              <circle cx="15" cy="9" r="1" className="fill-current" />
              <circle cx="9" cy="15" r="1" className="fill-current" />
            </svg>
            Aleatorio
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={undo} disabled={history.length === 0} className="flex-1">
            Deshacer
          </Button>
        </div>

        <div role="tablist" aria-label="Partes del jugador" className="grid grid-cols-5 gap-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              id={`tab-${t.id}`}
              aria-selected={tab === t.id}
              aria-controls="avatar-panel"
              onClick={() => setTab(t.id)}
              className={cn(
                "flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-[4px] border-2 border-ink text-[11px] font-bold uppercase tracking-wide",
                tab === t.id ? "bg-ink text-bg" : "bg-bg-elevated text-fg hover:bg-bg-raised",
              )}
            >
              <svg aria-hidden viewBox="0 0 24 24" className="size-5 fill-none stroke-current stroke-[1.8]">
                {t.icon}
              </svg>
              {t.label}
            </button>
          ))}
        </div>

        <div
          id="avatar-panel"
          role="tabpanel"
          aria-labelledby={`tab-${tab}`}
          className="flex min-h-40 flex-col gap-3 rounded-[6px] border-2 border-ink bg-bg-elevated p-3 shadow-card"
        >
          {tab === "body" && (
            <Group label="Cuerpo">
              <div className="flex gap-2">
                {BODY_TYPES.map((b) => (
                  <Chip
                    key={b.id}
                    selected={avatar.body === b.id}
                    onClick={() => apply({ ...avatar, body: b.id, hair: { ...avatar.hair, style: hairFor(avatar.hair.style, b.id) } })}
                  >
                    {b.label}
                  </Chip>
                ))}
              </div>
            </Group>
          )}
          {tab === "skin" && (
            <Group label="Tono de piel">
              <ColorRow palette={PALETTES.skin} selected={avatar.skin} onSelect={(skin) => apply({ ...avatar, skin })} />
            </Group>
          )}
          {tab === "hair" && (
            <>
              <Group label="Peinado">
                <div className="flex flex-wrap gap-2">
                  {hairOptionsFor(avatar.body).map((h) => (
                    <Chip key={h.id} selected={avatar.hair.style === h.id} onClick={() => apply({ ...avatar, hair: { ...avatar.hair, style: h.id } })}>
                      {h.label}
                    </Chip>
                  ))}
                </div>
              </Group>
              {avatar.hair.style !== "none" && (
                <Group label="Color de pelo">
                  <ColorRow palette={PALETTES.hair} selected={avatar.hair.color} onSelect={(color) => apply({ ...avatar, hair: { ...avatar.hair, color } })} />
                </Group>
              )}
            </>
          )}
          {tab === "kit" && (
            <>
              <Group label="Camiseta">
                <ColorRow palette={PALETTES.kit} selected={avatar.kit.shirt} onSelect={(shirt) => apply({ ...avatar, kit: { ...avatar.kit, shirt } })} />
              </Group>
              <Group label="Short">
                <ColorRow palette={PALETTES.kit} selected={avatar.kit.shorts} onSelect={(shorts) => apply({ ...avatar, kit: { ...avatar.kit, shorts } })} />
              </Group>
              <p className="text-xs text-fg-muted">En los partidos, la camiseta es la de tu selección.</p>
            </>
          )}
          {tab === "boots" && (
            <Group label="Botines">
              <ColorRow palette={PALETTES.boots} selected={avatar.boots.color} onSelect={(color) => apply({ ...avatar, boots: { color } })} />
            </Group>
          )}
        </div>

        {onSave && (
          <div className="flex flex-col gap-2">
            <Button type="button" onClick={handleSave} disabled={saving} block size="lg">
              {saving ? "Guardando…" : saved ? "Guardado ✓" : "Guardar jugador"}
            </Button>
            {saveError && <p className="text-sm font-semibold text-brand-ink">{saveError}</p>}
          </div>
        )}
      </div>
    </div>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-bold uppercase tracking-[0.14em] text-fg">{label}</span>
      {children}
    </div>
  );
}

function Chip({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        "min-h-11 rounded-[4px] px-4 text-sm font-semibold ring-1 ring-ink transition",
        selected ? "bg-ink text-bg" : "bg-bg-raised text-fg hover:bg-bg-overlay",
      )}
    >
      {children}
    </button>
  );
}

/** Swatches de una paleta. El color de cada botón es un dato (hex del catálogo) → `style` inevitable. */
function ColorRow({ palette, selected, onSelect }: { palette: readonly Swatch[]; selected: string; onSelect: (hex: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {palette.map(({ id, label, hex }) => {
        const on = selected.toLowerCase() === hex.toLowerCase();
        return (
          <button
            key={id}
            type="button"
            aria-label={label}
            aria-pressed={on}
            onClick={() => onSelect(hex)}
            style={{ backgroundColor: hex }}
            className={cn("size-11 rounded-full ring-2 transition", on ? "ring-ink ring-offset-2 ring-offset-bg" : "ring-border hover:ring-ring")}
          />
        );
      })}
    </div>
  );
}

/** Miniatura de un preset: piel, pelo y camiseta en tres bandas (sin canvas por chip). */
function PresetChip({ avatar }: { avatar: AvatarV2 }) {
  return (
    <span aria-hidden className="flex size-10 flex-col overflow-hidden rounded-full border-2 border-ink">
      <span className="h-1/4" style={{ backgroundColor: avatar.hair.style === "none" ? avatar.skin : avatar.hair.color }} />
      <span className="h-1/4" style={{ backgroundColor: avatar.skin }} />
      <span className="h-1/2" style={{ backgroundColor: avatar.kit.shirt }} />
    </span>
  );
}
