import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CUSTOM_UTILITIES, cn } from "./cn";

describe("cn con las utilidades propias (feedback 4 #11)", () => {
  it("la trama/rayado NO se come al color de fondo (y al revés)", () => {
    expect(cn("bg-bg-elevated/75 bg-halftone")).toBe("bg-bg-elevated/75 bg-halftone");
    expect(cn("bg-bg-elevated bg-halftone", "bg-scene-sky")).toBe("bg-halftone bg-scene-sky");
    expect(cn("bg-stripes-danger bg-brand")).toBe("bg-stripes-danger bg-brand");
  });

  it("sigue resolviendo conflictos reales", () => {
    expect(cn("bg-bg-elevated/75", "bg-bg-elevated/88")).toBe("bg-bg-elevated/88");
    expect(cn("shadow-card", "shadow-pop")).toBe("shadow-pop");
    expect(cn("text-fg", "text-brand")).toBe("text-brand");
  });

  it("font-mono (cifras tabulares) convive con la familia", () => {
    expect(cn("font-display font-mono")).toBe("font-display font-mono");
  });

  it("toda utilidad .bg-* propia de globals.css está declarada", () => {
    const css = readFileSync("app/globals.css", "utf8");
    const declared = [...css.matchAll(/^\.(bg-[a-z-]+)\s*\{/gm)].map((m) => m[1]);
    expect(declared.length).toBeGreaterThan(0);
    for (const c of declared) expect(CUSTOM_UTILITIES.bgImage).toContain(c);
    const shadows = [...css.matchAll(/--shadow-([a-z]+):/g)].map((m) => m[1]);
    for (const s of shadows) expect(CUSTOM_UTILITIES.shadow).toContain(s);
  });
});
