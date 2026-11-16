"use client";

/**
 * Creador de avatar 3D. A la izquierda el personaje rotable **arrastrando**; a la derecha
 * los selectores del catálogo v2 (piel, pelo, camiseta, short, botines) + toggle de cuerpo base.
 * Preview en vivo: todo cambio actualiza el `AvatarV2` en estado y se refleja al instante. Con `onSave`
 * (Server Action) persiste en `profiles.avatar` y, si hay `redirectTo`, navega al guardar.
 * Ver SPEC §8.2.
 */

import { BOOTS_PALETTE, HAIR_PALETTE, KIT_PALETTE, SKIN_PALETTE, type Swatch } from "@/lib/avatar/palette";
import { useCallback, useRef, useState } from "react";
import { useNav } from "@/lib/nav/useNav";
import type { BodyType } from "@/lib/avatar/types";
import { BODY_TYPES, hairFor, hairOptionsFor, type HairOption } from "@/lib/avatar/catalog";
import { DEFAULT_AVATAR, type AvatarV2 } from "@/lib/avatar/schema";
import type { SaveAvatarResult } from "@/app/(app)/avatar/actions";
import { Button } from "@/components/ui/Button";
import { AvatarViewer } from "./AvatarViewer";

interface AvatarCreatorProps {
  /** Avatar inicial (al editar desde Perfil). Por defecto, el avatar base. */
  initial?: AvatarV2;
  /** Server Action que persiste el avatar. Si falta, no se muestra el botón. */
  onSave?: (avatar: AvatarV2) => Promise<SaveAvatarResult>;
  /** Texto del botón de guardado. */
  saveLabel?: string;
  /** Si se pasa, al guardar con éxito navega a esta ruta (p. ej. "/perfil"). */
  redirectTo?: string;
}

export function AvatarCreator({
  initial = DEFAULT_AVATAR,
  onSave,
  saveLabel = "Guardar avatar",
  redirectTo,
}: AvatarCreatorProps) {
  const router = useNav();
  const [avatar, setAvatar] = useState<AvatarV2>(initial);
  const [rotationY, setRotationY] = useState(0.4);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const handleSave = useCallback(async () => {
    if (!onSave) return;
    setSaving(true);
    setSaveError(null);
    setSaved(false);
    // Mismo patrón que los flujos que SÍ navegan (LoginForm/RegisterForm): reseteamos el loading
    // ANTES de navegar y usamos `router.push` (no `replace`). En éxito con redirect navegamos sin
    // tocar más estado — la navegación desmonta el componente. (T1: antes con `replace` + reset en
    // `finally` después de navegar la navegación no surtía efecto.)
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

  // Drag para rotar (solo yaw). Capturamos el puntero sobre el contenedor del viewer.
  const dragRef = useRef<{ active: boolean; lastX: number }>({
    active: false,
    lastX: 0,
  });

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    dragRef.current = { active: true, lastX: e.clientX };
    e.currentTarget.setPointerCapture(e.pointerId);
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current.active) return;
    const dx = e.clientX - dragRef.current.lastX;
    dragRef.current.lastX = e.clientX;
    setRotationY((r) => r + dx * 0.01);
  }, []);

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    dragRef.current.active = false;
    e.currentTarget.releasePointerCapture(e.pointerId);
  }, []);

  // Helpers de actualización inmutable. Cualquier cambio invalida el "Guardado ✓".
  const update = (fn: (a: AvatarV2) => AvatarV2) => {
    setSaved(false);
    setAvatar(fn);
  };
  // Al cambiar de cuerpo, el peinado cae a uno que ese cuerpo ofrezca.
  const setBody = (body: BodyType) => update((a) => ({ ...a, body, hair: { ...a.hair, style: hairFor(a.hair.style, body) } }));

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 p-4 lg:flex-row lg:items-stretch">
      {/* Viewer rotable (sin recuadro, centrado) */}
      <div className="flex flex-col gap-3 lg:w-1/2">
        <div
          className="aspect-square w-full cursor-grab touch-none select-none rounded-[6px] border-2 border-ink bg-bg-raised shadow-card active:cursor-grabbing"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <AvatarViewer config={avatar} rotationY={rotationY} className="h-full w-full" />
        </div>

        {/* Toggle de cuerpo base */}
        <div className="flex gap-2">
          {BODY_TYPES.map((b) => (
            <button
              key={b.id}
              type="button"
              onClick={() => setBody(b.id)}
              className={`flex-1 rounded-[6px] px-3 py-2 text-sm font-medium ring-1 transition ${
                avatar.body === b.id
                  ? "bg-ink text-bg ring-ink"
                  : "bg-bg-raised text-fg ring-ink hover:bg-bg-overlay"
              }`}
            >
              {b.label}
            </button>
          ))}
        </div>
      </div>

      {/* Selectores */}
      <div className="flex flex-col gap-4 lg:w-1/2">
        <Selector label="Piel">
          <ColorRow palette={SKIN_PALETTE} selected={avatar.skin} onSelect={(skin) => update((a) => ({ ...a, skin }))} />
        </Selector>
        <Selector label="Pelo">
          <ChipRow
            options={hairOptionsFor(avatar.body)}
            selected={avatar.hair.style}
            onSelect={(style) => update((a) => ({ ...a, hair: { ...a.hair, style } }))}
          />
          {avatar.hair.style !== "none" && (
            <ColorRow
              palette={HAIR_PALETTE}
              selected={avatar.hair.color}
              onSelect={(color) => update((a) => ({ ...a, hair: { ...a.hair, color } }))}
            />
          )}
        </Selector>
        <Selector label="Camiseta">
          <ColorRow palette={KIT_PALETTE} selected={avatar.kit.shirt} onSelect={(shirt) => update((a) => ({ ...a, kit: { ...a.kit, shirt } }))} />
        </Selector>
        <Selector label="Short">
          <ColorRow palette={KIT_PALETTE} selected={avatar.kit.shorts} onSelect={(shorts) => update((a) => ({ ...a, kit: { ...a.kit, shorts } }))} />
        </Selector>
        <Selector label="Botines">
          <ColorRow palette={BOOTS_PALETTE} selected={avatar.boots.color} onSelect={(color) => update((a) => ({ ...a, boots: { color } }))} />
        </Selector>

        {onSave && (
          <div className="mt-2 flex flex-col gap-2">
            <Button type="button" onClick={handleSave} disabled={saving} block size="lg">
              {saving ? "Guardando…" : saved ? "Guardado ✓" : saveLabel}
            </Button>
            {saveError && <p className="text-sm font-semibold text-brand-ink">{saveError}</p>}
          </div>
        )}
      </div>
    </div>
  );
}

function Selector({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-[6px] border-2 border-ink bg-bg-elevated p-3 shadow-card">
      <span className="text-xs font-bold uppercase tracking-[0.14em] text-fg">
        {label}
      </span>
      {children}
    </div>
  );
}

function ChipRow<T extends string>({
  options,
  selected,
  onSelect,
}: {
  options: readonly (HairOption & { id: T })[];
  selected: T;
  onSelect: (id: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => onSelect(o.id)}
          className={`rounded-[4px] px-3 py-1.5 text-sm ring-1 transition ${
            selected === o.id
              ? "bg-ink text-bg ring-ink"
              : "bg-bg-raised text-fg ring-ink hover:bg-bg-overlay"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function ColorRow({
  palette,
  selected,
  onSelect,
}: {
  palette: readonly Swatch[];
  selected: string;
  onSelect: (color: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {palette.map(({ id, label, hex }) => (
        <button
          key={id}
          type="button"
          aria-label={`Color ${label}`}
          aria-pressed={selected.toLowerCase() === hex.toLowerCase()}
          onClick={() => onSelect(hex)}
          style={{ backgroundColor: hex }}
          className={`h-7 w-7 rounded-full ring-2 transition ${
            selected.toLowerCase() === hex.toLowerCase()
              ? "ring-ink ring-offset-2 ring-offset-bg"
              : "ring-border hover:ring-ring"
          }`}
        />
      ))}
    </div>
  );
}
