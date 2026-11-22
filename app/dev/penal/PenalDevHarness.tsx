"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { PenalSceneViewer } from "@/components/penal/PenalSceneViewer";
import type { PenalAnimation } from "@/components/penal/PenalScene";
import { Button } from "@/components/ui/Button";
import { PenaltyResultBalloon } from "@/components/penal/PenaltyResultBalloon";
import { CELEBRATION_IDS, CELEBRATION_NAMES, isCelebrationId, type CelebrationId } from "@/lib/avatar/celebrations";
import type { SceneRole } from "@/lib/penal/scene";
import type { PenaltyReason } from "@/lib/realtime/penal";

const KICKER: SceneRole = {
  avatar: { v: 2, body: "male", skin: "#A06B45", hair: { style: "parted", color: "#3A2A20" }, kit: { shirt: "#8FB2D3", shorts: "#1C1C1C" }, boots: { color: "#A8352B" } },
  kitTop: "#75aadb",
  kitSash: "#ffffff",
  brief: null,
};

const KEEPER: SceneRole = {
  avatar: { v: 2, body: "female", skin: "#E0B593", hair: { style: "bun", color: "#A07D4E" }, kit: { shirt: "#2C4A9A", shorts: "#1C1C1C" }, boots: { color: "#1C1C1C" } },
  kitTop: "#f2c230",
  kitSash: "#f2c230",
  brief: null,
};

const REASONS: PenaltyReason[] = ["goal", "save", "miss_wide"];

function parseShot(raw: string | null, celebration: CelebrationId | undefined): PenalAnimation | null {
  const m = raw ? /^(goal|save|miss_wide)-([0-3])$/.exec(raw) : null;
  const reason = REASONS.find((r) => r === m?.[1]);
  return m && reason ? { id: "dev-url", reason, variant: Number(m[2]), celebration } : null;
}

/** Variantes de papel del cartel (feedback 4 #11) para comparar con capturas: `?card=70|80|88|100`. */
const CARD_PAPER: Record<string, string> = {
  "70": "bg-bg-elevated/70",
  "80": "bg-bg-elevated/80",
  "88": "bg-bg-elevated/88",
  "100": "bg-bg-elevated",
};

/**
 * `?shot=goal-1&t=0.6` dispara la jugada y la congela en t (para screenshots headless).
 * `&celebration=siu|sky|crossed|cradle|slide` fuerza el festejo del gol (feedback 4 #16).
 * `&card=80` superpone el cartel de resultado (`default` = el de producción) para estudiar su transparencia.
 */
export function PenalDevHarness() {
  const params = useSearchParams();
  const freezeRaw = params.get("t");
  const freezeAt = freezeRaw !== null && Number.isFinite(Number(freezeRaw)) ? Number(freezeRaw) : undefined;
  const celRaw = params.get("celebration");
  const [celebration, setCelebration] = useState<CelebrationId | undefined>(isCelebrationId(celRaw) ? celRaw : undefined);
  const [anim, setAnim] = useState<PenalAnimation | null>(() => parseShot(params.get("shot"), celebration));
  const [n, setN] = useState(0);
  const card = params.get("card");
  const fire = (reason: PenaltyReason, variant: number) => {
    setN((x) => x + 1);
    setAnim({ id: `dev-${n}`, reason, variant, celebration });
  };
  const celebrate = (c: CelebrationId) => {
    setCelebration(c);
    setN((x) => x + 1);
    setAnim({ id: `dev-${n}`, reason: "goal", variant: anim?.variant ?? 1, celebration: c });
  };
  return (
    <main className="flex min-h-dvh flex-col gap-3 bg-bg p-4">
      <div className="relative aspect-[9/14] w-full max-w-md self-center overflow-hidden border-2 border-ink sm:aspect-video sm:max-w-3xl">
        <PenalSceneViewer kicker={KICKER} keeper={KEEPER} result={anim} freezeAt={freezeAt} className="h-full w-full" />
        {card && (
          <PenaltyResultBalloon
            idx={3}
            homeScore={2}
            awayScore={1}
            scored={anim?.reason === "goal"}
            note={null}
            correctText="Diego Maradona"
            answeredRight
            className={CARD_PAPER[card]}
          />
        )}
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        <Button variant="outline" size="sm" onClick={() => setAnim(null)}>
          Idle
        </Button>
        {REASONS.map((r) =>
          [0, 1, 2, 3].map((v) => (
            <Button key={`${r}-${v}`} variant="outline" size="sm" onClick={() => fire(r, v)}>
              {r} {v}
            </Button>
          )),
        )}
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        {CELEBRATION_IDS.map((c) => (
          <Button key={c} variant={c === celebration ? "primary" : "outline"} size="sm" onClick={() => celebrate(c)}>
            {CELEBRATION_NAMES[c]}
          </Button>
        ))}
      </div>
    </main>
  );
}
