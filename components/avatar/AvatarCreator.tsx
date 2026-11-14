"use client";

/**
 * Creador de avatar 3D. A la izquierda el personaje rotable **arrastrando**; a la derecha
 * 4 selectores (pelo, remera, pantalón, zapatos) + toggle de cuerpo base. Preview en vivo:
 * todo cambio actualiza el `AvatarConfig` en estado y se refleja al instante. Con `onSave`
 * (Server Action) persiste en `profiles.avatar` y, si hay `redirectTo`, navega al guardar.
 * Ver SPEC §8.2.
 */

import { useCallback, useRef, useState } from "react";
import { useNav } from "@/lib/nav/useNav";
import type {
  AvatarConfig,
  BodyType,
  PartCategory,
  TintedPart,
} from "@/lib/avatar/types";
import {
  BODY_TYPES,
  COLOR_PALETTE,
  DEFAULT_AVATAR,
  PARTS,
  type PartOption,
} from "@/lib/avatar/parts";
import type { SaveAvatarResult } from "@/app/(app)/avatar/actions";
import { Button } from "@/components/ui/Button";
import { AvatarViewer } from "./AvatarViewer";

interface AvatarCreatorProps {
  /** Avatar inicial (al editar desde Perfil). Por defecto, el avatar base. */
  initial?: AvatarConfig;
  /** Server Action que persiste el avatar. Si falta, no se muestra el botón. */
  onSave?: (avatar: AvatarConfig) => Promise<SaveAvatarResult>;
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
  const [avatar, setAvatar] = useState<AvatarConfig>(initial);
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
  const setBodyType = (bodyType: BodyType) => {
    setSaved(false);
    setAvatar((a) => ({ ...a, bodyType }));
  };

  const setTintedPart = (category: PartCategory, next: TintedPart) => {
    setSaved(false);
    setAvatar((a) => ({ ...a, [category]: next }));
  };

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
              onClick={() => setBodyType(b.id)}
              className={`flex-1 rounded-[6px] px-3 py-2 text-sm font-medium ring-1 transition ${
                avatar.bodyType === b.id
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
        {/* Pelo */}
        <Selector label="Pelo">
          <ChipRow
            options={PARTS.hair}
            selected={avatar.hair.part}
            onSelect={(part) => setTintedPart("hair", { ...avatar.hair, part })}
          />
          {avatar.hair.part !== "none" && (
            <ColorRow
              selected={avatar.hair.color}
              onSelect={(color) => setTintedPart("hair", { ...avatar.hair, color })}
            />
          )}
        </Selector>

        <TintedSelector
          label="Remera"
          category="top"
          value={avatar.top}
          onChange={(next) => setTintedPart("top", next)}
        />
        <TintedSelector
          label="Pantalón"
          category="bottom"
          value={avatar.bottom}
          onChange={(next) => setTintedPart("bottom", next)}
        />
        <TintedSelector
          label="Zapatos"
          category="shoes"
          value={avatar.shoes}
          onChange={(next) => setTintedPart("shoes", next)}
        />

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

function TintedSelector({
  label,
  category,
  value,
  onChange,
}: {
  label: string;
  category: PartCategory;
  value: TintedPart;
  onChange: (next: TintedPart) => void;
}) {
  return (
    <Selector label={label}>
      <ChipRow
        options={PARTS[category]}
        selected={value.part}
        onSelect={(part) => onChange({ ...value, part })}
      />
      <ColorRow
        selected={value.color}
        onSelect={(color) => onChange({ ...value, color })}
      />
    </Selector>
  );
}

function ChipRow({
  options,
  selected,
  onSelect,
}: {
  options: readonly PartOption[];
  selected: string;
  onSelect: (id: string) => void;
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
  selected,
  onSelect,
}: {
  selected: string;
  onSelect: (color: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {COLOR_PALETTE.map((color) => (
        <button
          key={color}
          type="button"
          aria-label={`Color ${color}`}
          onClick={() => onSelect(color)}
          style={{ backgroundColor: color }}
          className={`h-7 w-7 rounded-full ring-2 transition ${
            selected.toLowerCase() === color.toLowerCase()
              ? "ring-ink ring-offset-2 ring-offset-bg"
              : "ring-border hover:ring-ring"
          }`}
        />
      ))}
    </div>
  );
}
