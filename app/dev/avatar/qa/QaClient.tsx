"use client";

import dynamic from "next/dynamic";
import { isHairStyle } from "@/lib/avatar/catalog";
import { parseAvatar } from "@/lib/avatar/schema";
import type { BodyType } from "@/lib/avatar/types";
import { BOOTS_PALETTE, deltaE, HAIR_PALETTE, KIT_PALETTE, MIN_KIT_SKIN_DELTA_E, SKIN_PALETTE, type Swatch } from "@/lib/avatar/palette";
import { useGlbReady } from "@/components/avatar/useGlbReady";

const QaCanvas = dynamic(() => import("./QaCanvas").then((m) => m.QaCanvas), { ssr: false });

function SwatchRow({ title, palette }: { title: string; palette: readonly Swatch[] }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="font-display text-xl font-extrabold uppercase">{title}</h2>
      <div className="flex flex-wrap gap-2">
        {palette.map((s) => (
          <figure key={s.id} className="flex w-20 flex-col items-center gap-1">
            <span className="size-14 rounded-sm border-2 border-ink" style={{ backgroundColor: s.hex }} />
            <figcaption className="text-center text-[10px] leading-tight">
              {s.label}
              <br />
              {s.hex}
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}

/** Ropa (filas) contra piel (columnas): ΔE y si se lee "desnudo" (< 15). */
function KitVsSkin() {
  return (
    <table className="border-collapse text-[10px]">
      <thead>
        <tr>
          <th />
          {SKIN_PALETTE.map((s) => (
            <th key={s.id} className="p-1">
              <span className="block size-6 border border-ink" style={{ backgroundColor: s.hex }} />
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {KIT_PALETTE.map((k) => (
          <tr key={k.id}>
            <th className="p-1 text-left">
              <span className="inline-block size-4 border border-ink align-middle" style={{ backgroundColor: k.hex }} /> {k.label}
            </th>
            {SKIN_PALETTE.map((s) => {
              const d = deltaE(k.hex, s.hex);
              return (
                <td key={s.id} className={`p-1 text-center ${d < MIN_KIT_SKIN_DELTA_E ? "bg-brand text-bg" : ""}`}>
                  {d.toFixed(0)}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function QaClient(props: {
  sheet: string | null;
  body: BodyType;
  hair: string;
  hairColor: string;
  skin: string;
  view: string;
  pose: string;
}) {
  const { status } = useGlbReady([props.body]);
  if (props.sheet === "swatches") {
    return (
      <main data-qa-ready="1" className="flex w-[768px] flex-col gap-4 bg-bg p-4 text-fg">
        <SwatchRow title="Pelo" palette={HAIR_PALETTE} />
        <SwatchRow title="Piel" palette={SKIN_PALETTE} />
        <SwatchRow title="Ropa" palette={KIT_PALETTE} />
        <SwatchRow title="Botines" palette={BOOTS_PALETTE} />
        <h2 className="font-display text-xl font-extrabold uppercase">Ropa vs piel (ΔE; rojo = &lt; 15)</h2>
        <KitVsSkin />
      </main>
    );
  }
  const config = parseAvatar({
    v: 2,
    body: props.body,
    skin: props.skin,
    hair: { style: isHairStyle(props.hair) ? props.hair : "parted", color: props.hairColor },
    kit: { shirt: "#2C4A9A", shorts: "#1C1C1C" },
    boots: { color: "#A8352B" },
  });
  return (
    <main className="size-[768px] bg-bg">
      {status === "ready" ? <QaCanvas config={config} view={props.view} pose={props.pose} /> : <p>{status}</p>}
    </main>
  );
}
