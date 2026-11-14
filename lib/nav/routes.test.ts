import { readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";
import { ROUTES, routeFor } from "./routes";

const APP_DIR = join(process.cwd(), "app");

/** Todas las páginas reales: `app/(grupo)/perfil/page.tsx` → `/perfil`. Ignora `/dev/*` (404 en prod). */
function pagePatterns(dir = APP_DIR): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...pagePatterns(full));
    else if (name === "page.tsx") {
      const segs = relative(APP_DIR, dir)
        .split(sep)
        .filter((s) => s && !/^\(.+\)$/.test(s));
      out.push(`/${segs.join("/")}`);
    }
  }
  return out.filter((p) => !p.startsWith("/dev"));
}

describe("mapa de pantallas", () => {
  it("toda página de app/ está declarada (con su padre) en ROUTES", () => {
    const declared = new Set(ROUTES.map((r) => r.pattern));
    const missing = pagePatterns().filter((p) => !declared.has(p));
    expect(missing).toEqual([]);
  });

  it("no hay rutas declaradas que no existan", () => {
    const pages = new Set(pagePatterns());
    expect(ROUTES.map((r) => r.pattern).filter((p) => !pages.has(p))).toEqual([]);
  });

  it("el grupo declarado coincide con la carpeta (app)/(game)", () => {
    const groupOf = (pattern: string): string => {
      const seg = pattern.split("/")[1] ?? "";
      if (!seg) return "site";
      for (const g of ["app", "game"] as const) {
        try {
          statSync(join(APP_DIR, `(${g})`, seg));
          return g;
        } catch {
          // no está en ese grupo
        }
      }
      return "site";
    };
    for (const r of ROUTES) expect([r.pattern, groupOf(r.pattern)]).toEqual([r.pattern, r.group]);
  });

  it("todo padre es una pantalla declarada y no hay ciclos", () => {
    for (const r of ROUTES) {
      const seen = new Set<string>();
      let cur: string | null = r.pattern;
      while (cur) {
        expect(seen.has(cur)).toBe(false);
        seen.add(cur);
        const def = routeFor(cur);
        expect(def).not.toBeNull();
        cur = def!.parent;
      }
    }
  });

  it("resuelve rutas dinámicas", () => {
    expect(routeFor("/sala/ABC123")?.pattern).toBe("/sala/[code]");
    expect(routeFor("/perfil/")?.pattern).toBe("/perfil");
    expect(routeFor("/nada")).toBeNull();
  });
});
