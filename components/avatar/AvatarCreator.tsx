"use client";

/**
 * Creador de avatar 3D. A la izquierda el personaje rotable **arrastrando**; a la derecha
 * 4 selectores (cabeza/pelo, remera, pantalón, zapatos) + toggle de cuerpo base. Preview en
 * vivo: todo cambio actualiza el `AvatarConfig` en estado y se refleja al instante. El
 * guardado en `profiles.avatar` es la tarea 2.5. Ver SPEC §8.2.
 */

import { useCallback, useRef, useState } from "react";
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
  HEAD_PARTS,
  PARTS,
  type PartOption,
} from "@/lib/avatar/parts";
import { AvatarViewer } from "./AvatarViewer";

interface AvatarCreatorProps {
  /** Avatar inicial (al editar desde Perfil). Por defecto, el avatar base. */
  initial?: AvatarConfig;
  /** Se llama con el avatar actual cuando el usuario confirma (lo usa 2.5). */
  onConfirm?: (avatar: AvatarConfig) => void;
  /** Texto del botón de confirmación. */
  confirmLabel?: string;
}

export function AvatarCreator({
  initial = DEFAULT_AVATAR,
  onConfirm,
  confirmLabel = "Guardar avatar",
}: AvatarCreatorProps) {
  const [avatar, setAvatar] = useState<AvatarConfig>(initial);
  const [rotationY, setRotationY] = useState(0.4);

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

  // Helpers de actualización inmutable.
  const setBodyType = (bodyType: BodyType) =>
    setAvatar((a) => ({ ...a, bodyType }));

  const setHead = (head: string) => setAvatar((a) => ({ ...a, head }));

  const setTintedPart = (category: Exclude<PartCategory, "head">, next: TintedPart) =>
    setAvatar((a) => ({ ...a, [category]: next }));

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 p-4 lg:flex-row lg:items-stretch">
      {/* Viewer rotable */}
      <div className="flex flex-col gap-3 lg:w-1/2">
        <div
          className="relative aspect-square w-full cursor-grab touch-none select-none overflow-hidden rounded-2xl bg-gradient-to-b from-white/5 to-white/0 ring-1 ring-white/10 active:cursor-grabbing"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <AvatarViewer config={avatar} rotationY={rotationY} className="h-full w-full" />
          <p className="pointer-events-none absolute bottom-3 left-0 right-0 text-center text-xs text-white/40">
            Arrastrá para rotar
          </p>
        </div>

        {/* Toggle de cuerpo base */}
        <div className="flex gap-2">
          {BODY_TYPES.map((b) => (
            <button
              key={b.id}
              type="button"
              onClick={() => setBodyType(b.id)}
              className={`flex-1 rounded-xl px-3 py-2 text-sm font-medium ring-1 transition ${
                avatar.bodyType === b.id
                  ? "bg-white/15 text-white ring-white/30"
                  : "bg-white/5 text-white/60 ring-white/10 hover:bg-white/10"
              }`}
            >
              {b.label}
            </button>
          ))}
        </div>
      </div>

      {/* Selectores */}
      <div className="flex flex-col gap-4 lg:w-1/2">
        {/* Cabeza / pelo (agrupado) */}
        <Selector label="Cabeza / pelo">
          <ChipRow
            options={HEAD_PARTS}
            selected={avatar.head}
            onSelect={setHead}
          />
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

        {onConfirm && (
          <button
            type="button"
            onClick={() => onConfirm(avatar)}
            className="mt-2 rounded-xl bg-white px-4 py-3 text-sm font-semibold text-black transition hover:bg-white/90"
          >
            {confirmLabel}
          </button>
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
    <div className="flex flex-col gap-2 rounded-2xl bg-white/5 p-3 ring-1 ring-white/10">
      <span className="text-xs font-semibold uppercase tracking-wide text-white/50">
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
  category: Exclude<PartCategory, "head">;
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
          className={`rounded-lg px-3 py-1.5 text-sm ring-1 transition ${
            selected === o.id
              ? "bg-white/15 text-white ring-white/30"
              : "bg-white/5 text-white/60 ring-white/10 hover:bg-white/10"
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
              ? "ring-white"
              : "ring-white/20 hover:ring-white/40"
          }`}
        />
      ))}
    </div>
  );
}
