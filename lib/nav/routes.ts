/**
 * Mapa de pantallas — fuente única de la navegación (feedback 14/11: "no hay botones para volver").
 *
 * Cada pantalla declara su PADRE: el "volver" va siempre ahí, nunca a `router.back()` (un link de
 * WhatsApp abre sin historial y el back del navegador te sacaría de la app). El `ScreenHeader` lo lee
 * del pathname, así que una pantalla nueva no puede olvidarse del volver: `routes.test.ts` falla si
 * hay un `page.tsx` que no está acá.
 *
 * `group`:
 *  - `site`: landing y auth (con footer, scrollea como una web).
 *  - `app`:  pantallas de la app (header con volver, scroll interno).
 *  - `game`: sala, cola y partido (pantalla fija 100dvh, sin footer; salir = acción con RPC).
 */

export type RouteGroup = "site" | "app" | "game";

export interface RouteDef {
  /** Patrón de Next (`/sala/[code]`). */
  pattern: string;
  title: string;
  /** Ruta a la que vuelve el header; `null` = raíz (sin volver). */
  parent: string | null;
  group: RouteGroup;
}

export const ROUTES: readonly RouteDef[] = [
  { pattern: "/", title: "Inicio", parent: null, group: "site" },
  { pattern: "/login", title: "Entrar", parent: "/", group: "site" },
  { pattern: "/register", title: "Crear cuenta", parent: "/", group: "site" },
  { pattern: "/forgot", title: "Recuperar contraseña", parent: "/login", group: "site" },
  { pattern: "/auth/reset", title: "Nueva contraseña", parent: "/", group: "site" },
  { pattern: "/jugar", title: "Jugar", parent: "/", group: "app" },
  { pattern: "/perfil", title: "Perfil", parent: "/", group: "app" },
  { pattern: "/perfil/historial", title: "Historial", parent: "/perfil", group: "app" },
  { pattern: "/ranking", title: "Tabla", parent: "/perfil", group: "app" },
  { pattern: "/avatar", title: "Tu jugador", parent: "/perfil", group: "app" },
  { pattern: "/hinchas", title: "Ranking de hinchas", parent: "/", group: "app" },
  { pattern: "/sala/[code]", title: "Sala", parent: "/jugar", group: "game" },
  { pattern: "/ranked", title: "Ranked", parent: "/jugar", group: "game" },
  { pattern: "/partido", title: "Partido", parent: null, group: "game" },
];

function toRegExp(pattern: string): RegExp {
  const body = pattern
    .split("/")
    .map((seg) => (/^\[.+\]$/.test(seg) ? "[^/]+" : seg.replace(/[.*+?^${}()|\\]/g, "\\$&")))
    .join("/");
  return new RegExp(`^${body}/?$`);
}

const COMPILED = ROUTES.map((r) => ({ def: r, re: toRegExp(r.pattern) }));

/** Definición de la pantalla para un pathname real (`/sala/ABC123` → `/sala/[code]`). */
export function routeFor(pathname: string): RouteDef | null {
  return COMPILED.find((c) => c.re.test(pathname))?.def ?? null;
}
