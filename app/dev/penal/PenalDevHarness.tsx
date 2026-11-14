"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { PenalSceneViewer } from "@/components/penal/PenalSceneViewer";
import type { PenalAnimation } from "@/components/penal/PenalScene";
import { Button } from "@/components/ui/Button";
import type { SceneRole } from "@/lib/penal/scene";
import type { PenaltyReason } from "@/lib/realtime/penal";

const KICKER: SceneRole = {
  avatar: {
    bodyType: "male",
    hair: { part: "short", color: "#2b1d14" },
    top: { part: "tee", color: "#75aadb" },
    bottom: { part: "shorts", color: "#141414" },
    shoes: { part: "cleats", color: "#d7261e" },
  },
  kitTop: "#75aadb",
  kitSash: "#ffffff",
  brief: null,
};

const KEEPER: SceneRole = {
  avatar: {
    bodyType: "female",
    hair: { part: "bun", color: "#c58b4a" },
    top: { part: "longsleeve", color: "#1f3fa8" },
    bottom: { part: "shorts", color: "#141414" },
    shoes: { part: "boots", color: "#141414" },
  },
  kitTop: "#f2c230",
  kitSash: "#f2c230",
  brief: null,
};

const REASONS: PenaltyReason[] = ["goal", "save", "miss_wide"];

function parseShot(raw: string | null): PenalAnimation | null {
  const m = raw ? /^(goal|save|miss_wide)-([0-3])$/.exec(raw) : null;
  const reason = REASONS.find((r) => r === m?.[1]);
  return m && reason ? { id: "dev-url", reason, variant: Number(m[2]) } : null;
}

/** `?shot=goal-1&t=0.6` dispara la jugada y la congela en t (para screenshots headless). */
export function PenalDevHarness() {
  const params = useSearchParams();
  const freezeRaw = params.get("t");
  const freezeAt = freezeRaw !== null && Number.isFinite(Number(freezeRaw)) ? Number(freezeRaw) : undefined;
  const [anim, setAnim] = useState<PenalAnimation | null>(() => parseShot(params.get("shot")));
  const [n, setN] = useState(0);
  const fire = (reason: PenaltyReason, variant: number) => {
    setN((x) => x + 1);
    setAnim({ id: `dev-${n}`, reason, variant });
  };
  return (
    <main className="flex min-h-dvh flex-col gap-3 bg-bg p-4">
      <PenalSceneViewer kicker={KICKER} keeper={KEEPER} result={anim} freezeAt={freezeAt} className="aspect-[9/14] w-full max-w-md self-center border-2 border-ink sm:aspect-video sm:max-w-3xl" />
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
    </main>
  );
}
